-- ============================================================================
-- Migration 019 — Compensating fixes for regressions in 017 + remaining items
-- ============================================================================
-- Fixes:
--   R1  ship_order regression: restore shipment_number, shop_id, shipment_items
--       INSERT, and use quantity_shipped fallback (017 broke NOT NULL constraints
--       and dropped partial-shipment semantics).
--   R2  Security hole: REVOKE EXECUTE on update_stock_balance and
--       set_initial_stock from anon/authenticated. These low-level writers
--       must only be callable from other SECURITY DEFINER RPCs.
--   R3  confirm_receipt missed updated_at = NOW() in UPDATE.
--   R4  rpc_pending_order_add_item used INT for quantity; schema is NUMERIC(12,3).
--   M7  rpc_dashboard_summary critical CTE used `<` while the stats CTE uses
--       `<=`. Align both to `<=`.
--   M8  audit_trigger_func never logged DELETE because the early RETURN OLD;
--       preceded the audit_log INSERT. Restructure.
--   M10 Add pg_trgm extension + GIN indexes on products.name and products.sku
--       to make `name ILIKE '%foo%'` use a Bitmap Index Scan instead of Seq Scan.
--   H15 Add partial unique index on orders.telegram_message_id (source='telegram')
--       to dedupe Telegram webhook retries.
--
-- How to apply: paste into Supabase Studio SQL Editor, run once.
-- Safe to re-run: every change is idempotent (DROP IF EXISTS / CREATE OR REPLACE
-- / CREATE INDEX IF NOT EXISTS).
-- ============================================================================

BEGIN;

-- ============================================================================
-- R1: ship_order — full restore + status guard + FOR UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.ship_order(
    p_order_id UUID,
    p_user_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order           RECORD;
    v_shipment_id     UUID;
    v_shipment_number TEXT;
    v_item            RECORD;
    v_qty             NUMERIC(12, 3);
BEGIN
    -- Lock the order row to prevent concurrent ships
    SELECT * INTO v_order
    FROM household_chemicals.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;
    IF v_order.status NOT IN ('submitted', 'confirmed', 'partially_shipped') THEN
        RAISE EXCEPTION 'Cannot ship order in status: %', v_order.status;
    END IF;

    v_shipment_number := household_chemicals.next_document_number('SH');

    INSERT INTO household_chemicals.shipments (
        shipment_number, order_id, warehouse_id, shop_id,
        status, created_by, shipped_at
    ) VALUES (
        v_shipment_number, p_order_id, v_order.warehouse_id, v_order.shop_id,
        'shipped', p_user_id, NOW()
    )
    RETURNING id INTO v_shipment_id;

    -- Insert shipment_items + adjust stock for each order line.
    -- Use quantity_shipped if it was set (> 0), otherwise fall back to
    -- quantity_requested (full ship). shipment_items has CHECK quantity > 0,
    -- so we skip zero rows.
    FOR v_item IN
        SELECT id, product_id, quantity_requested, quantity_shipped
        FROM household_chemicals.order_items
        WHERE order_id = p_order_id
    LOOP
        v_qty := CASE
            WHEN COALESCE(v_item.quantity_shipped, 0) > 0 THEN v_item.quantity_shipped
            ELSE v_item.quantity_requested
        END;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        INSERT INTO household_chemicals.shipment_items (
            shipment_id, order_item_id, product_id, quantity
        ) VALUES (
            v_shipment_id, v_item.id, v_item.product_id, v_qty
        );

        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_order.warehouse_id, -v_qty,
            'shipment', 'shipment', v_shipment_id,
            'Відвантаження за заявкою ' || v_order.order_number, p_user_id
        );

        -- Reflect what was actually shipped on the order_item
        UPDATE household_chemicals.order_items
        SET quantity_shipped = v_qty, updated_at = NOW()
        WHERE id = v_item.id;
    END LOOP;

    UPDATE household_chemicals.orders
    SET status = 'shipped', shipped_at = NOW(), updated_at = NOW()
    WHERE id = p_order_id;

    RETURN v_shipment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.ship_order(UUID, UUID) TO anon, authenticated;

-- ============================================================================
-- R2: Revoke EXECUTE on low-level stock writers from anon/authenticated.
-- These should only be reached via other SECURITY DEFINER functions
-- (confirm_receipt, ship_order, confirm_transfer, confirm_write_off,
-- complete_inventory, set_initial_stock).
-- ============================================================================
REVOKE EXECUTE ON FUNCTION household_chemicals.update_stock_balance(
    INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION household_chemicals.set_initial_stock(
    INT, INT, NUMERIC, UUID
) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION household_chemicals.update_stock_balance(
    INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) TO service_role;

GRANT EXECUTE ON FUNCTION household_chemicals.set_initial_stock(
    INT, INT, NUMERIC, UUID
) TO service_role;

-- ============================================================================
-- R3: confirm_receipt — include updated_at = NOW() in the final UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.confirm_receipt(
    p_receipt_id UUID,
    p_user_id    UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receipt RECORD;
    v_item    RECORD;
BEGIN
    SELECT * INTO v_receipt
    FROM household_chemicals.receipts
    WHERE id = p_receipt_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
    IF v_receipt.status != 'draft' THEN
        RAISE EXCEPTION 'Receipt already %', v_receipt.status;
    END IF;

    FOR v_item IN
        SELECT product_id, quantity
        FROM household_chemicals.receipt_items
        WHERE receipt_id = p_receipt_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_receipt.warehouse_id, v_item.quantity,
            'receipt', 'receipt', p_receipt_id,
            'Прихід по накладній ' || v_receipt.receipt_number, p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.receipts
    SET status       = 'confirmed',
        confirmed_by = p_user_id,
        confirmed_at = NOW(),
        updated_at   = NOW()
    WHERE id = p_receipt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_receipt(UUID, UUID) TO anon, authenticated;

-- ============================================================================
-- R4: rpc_pending_order_add_item — quantity NUMERIC(12,3), not INT
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.rpc_pending_order_add_item(INT, BIGINT, INT, INT);

CREATE OR REPLACE FUNCTION household_chemicals.rpc_pending_order_add_item(
    p_telegram_user_id INT,
    p_chat_id          BIGINT,
    p_product_id       INT,
    p_quantity         NUMERIC(12, 3)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_items        JSONB;
    v_existing_idx INT;
    v_prev_qty     NUMERIC(12, 3);
BEGIN
    SELECT items INTO v_items
    FROM household_chemicals.telegram_pending_orders
    WHERE telegram_user_id = p_telegram_user_id AND chat_id = p_chat_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending order not found');
    END IF;

    SELECT idx INTO v_existing_idx
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS arr(item, idx)
    WHERE (item->>'product_id') = p_product_id::TEXT
    LIMIT 1;

    IF v_existing_idx IS NOT NULL THEN
        v_prev_qty := COALESCE(
            ((v_items->(v_existing_idx - 1))->>'quantity')::NUMERIC,
            0
        );
        v_items := jsonb_set(
            v_items,
            ARRAY[(v_existing_idx - 1)::TEXT, 'quantity'],
            to_jsonb(v_prev_qty + p_quantity)
        );
    ELSE
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'product_id', p_product_id,
            'quantity',   p_quantity
        ));
    END IF;

    UPDATE household_chemicals.telegram_pending_orders
    SET items      = v_items,
        step       = 'adding_items',
        updated_at = NOW()
    WHERE telegram_user_id = p_telegram_user_id AND chat_id = p_chat_id;

    RETURN jsonb_build_object('success', true, 'items', v_items);
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_pending_order_add_item(
    INT, BIGINT, INT, NUMERIC
) TO service_role;
-- Note: this RPC is reached only from the Telegram webhook (service_role).
-- We do NOT grant it to anon/authenticated.

-- ============================================================================
-- M7: rpc_dashboard_summary — critical CTE used `<`, align with stats CTE `<=`
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_dashboard_summary(
    p_warehouse_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH stats AS (
      SELECT
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0), 0) AS products_in_stock,
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (WHERE COALESCE(sb.quantity, 0) <= 0), 0) AS products_out_of_stock,
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (
          WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock
        ), 0) AS critical_items,
        COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.orders o
         WHERE o.status IN ('submitted', 'confirmed')
           AND o.created_at::date = CURRENT_DATE
           AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ) AS pending_orders,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.shipments s
         WHERE s.status = 'shipped'
           AND s.shipped_at::date = CURRENT_DATE
           AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
        ) AS shipments_today,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.receipts r
         WHERE r.status = 'draft'
           AND (p_warehouse_id IS NULL OR r.warehouse_id = p_warehouse_id)
        ) AS draft_receipts,
        COALESCE(COUNT(DISTINCT w.id) FILTER (WHERE w.is_active = true), 0) AS active_warehouses
      FROM household_chemicals.warehouses w
      LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
        AND (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
      LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
      WHERE (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
    ),
    critical AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'product_id', sb.product_id,
        'product_name', p.name,
        'warehouse_id', sb.warehouse_id,
        'warehouse_name', w.name,
        'quantity', sb.quantity,
        'min_stock', p.min_stock,
        'deficit', p.min_stock - sb.quantity
      ) ORDER BY (p.min_stock - sb.quantity) DESC), '[]'::jsonb) AS items
      FROM household_chemicals.stock_balances sb
      JOIN household_chemicals.products p ON p.id = sb.product_id AND p.min_stock IS NOT NULL
      JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
      WHERE sb.quantity <= p.min_stock  -- M7: was `<`, now `<=` to match stats
        AND (p_warehouse_id IS NULL OR sb.warehouse_id = p_warehouse_id)
    ),
    recent_movements AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', sm.id,
        'product_name', p.name,
        'warehouse_name', w.name,
        'quantity_change', sm.quantity_change,
        'movement_type', sm.movement_type,
        'created_at', sm.created_at
      ) ORDER BY sm.created_at DESC), '[]'::jsonb) AS items
      FROM household_chemicals.stock_movements sm
      JOIN household_chemicals.products p ON p.id = sm.product_id
      JOIN household_chemicals.warehouses w ON w.id = sm.warehouse_id
      WHERE (p_warehouse_id IS NULL OR sm.warehouse_id = p_warehouse_id)
      LIMIT 20
    ),
    pending_orders_list AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'shop_name', s.name,
        'status', o.status,
        'items_count', (SELECT COUNT(*) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'total_requested', (SELECT COALESCE(SUM(oi.quantity_requested), 0) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'created_at', o.created_at
      ) ORDER BY o.created_at DESC), '[]'::jsonb) AS items
      FROM household_chemicals.orders o
      JOIN household_chemicals.shops s ON s.id = o.shop_id
      WHERE o.status IN ('submitted', 'confirmed')
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      LIMIT 10
    )
    SELECT jsonb_build_object(
      'stats', (SELECT row_to_json(stats)::jsonb FROM stats),
      'critical_items', COALESCE(critical.items, '[]'::jsonb),
      'recent_movements', COALESCE(recent_movements.items, '[]'::jsonb),
      'pending_orders', COALESCE(pending_orders_list.items, '[]'::jsonb)
    ) INTO v_result
    FROM critical, recent_movements, pending_orders_list;

    RETURN COALESCE(v_result, jsonb_build_object(
      'stats', jsonb_build_object(
        'products_in_stock', 0, 'products_out_of_stock', 0,
        'critical_items', 0, 'stock_value', 0,
        'pending_orders', 0, 'shipments_today', 0,
        'draft_receipts', 0, 'active_warehouses', 0
      ),
      'critical_items', '[]'::jsonb,
      'recent_movements', '[]'::jsonb,
      'pending_orders', '[]'::jsonb
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_dashboard_summary(INT) TO anon, authenticated;

-- ============================================================================
-- M8: audit_trigger_func — DELETE was returning OLD before audit_log INSERT,
-- so deletes were never logged. Restructure: INSERT first, then RETURN.
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action    TEXT;
    v_changes   JSONB := '{}'::jsonb;
    v_entity_id TEXT;
    v_key       TEXT;
    v_old_json  JSONB;
    v_new_json  JSONB;
    v_old_val   TEXT;
    v_new_val   TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action    := 'create';
        v_entity_id := COALESCE(NEW.id::TEXT, random()::TEXT);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action    := 'update';
        v_entity_id := COALESCE(NEW.id::TEXT, random()::TEXT);

        v_old_json := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new_json := to_jsonb(NEW) - 'created_at' - 'updated_at';

        FOR v_key IN
            SELECT key FROM jsonb_each_text(v_old_json)
            INTERSECT
            SELECT key FROM jsonb_each_text(v_new_json)
        LOOP
            v_old_val := COALESCE(v_old_json->>v_key, '');
            v_new_val := COALESCE(v_new_json->>v_key, '');
            IF v_old_val != v_new_val THEN
                v_changes := v_changes || jsonb_build_object(
                    v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val)
                );
            END IF;
        END LOOP;
    ELSIF TG_OP = 'DELETE' THEN
        v_action    := 'delete';
        v_entity_id := COALESCE(OLD.id::TEXT, random()::TEXT);
        v_changes   := jsonb_build_object('deleted_record', to_jsonb(OLD));
    END IF;

    -- Unified INSERT: runs for all three operations (INSERT/UPDATE/DELETE)
    INSERT INTO household_chemicals.audit_log (
        action, entity_type, entity_id, changes
    ) VALUES (
        v_action, TG_TABLE_NAME, v_entity_id,
        CASE WHEN v_changes = '{}'::jsonb THEN NULL ELSE v_changes END
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ============================================================================
-- M10: pg_trgm + GIN indexes on products.name and products.sku
-- Speeds up `name ILIKE '%foo%'` / `sku ILIKE '%foo%'` in rpc_product_catalog.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON household_chemicals.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
    ON household_chemicals.products USING gin (sku gin_trgm_ops)
    WHERE sku IS NOT NULL;

-- ============================================================================
-- H15: Dedupe Telegram orders by message_id — partial unique index
-- so the second webhook delivery of the same message can't create a duplicate.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_telegram_msg
    ON household_chemicals.orders (telegram_message_id)
    WHERE telegram_message_id IS NOT NULL AND source = 'telegram';

COMMIT;

-- ============================================================================
-- Post-apply verification (run manually, not part of the transaction)
-- ============================================================================
-- 1. ship_order:
--    SELECT household_chemicals.ship_order('<order_id>', NULL);
--    Then: SELECT shipment_number, shop_id FROM shipments WHERE id = <returned>;
--    Both should be non-NULL. shipment_items should have one row per shipped product.
--
-- 2. Grants:
--    SET ROLE anon;
--    SELECT household_chemicals.update_stock_balance(1, 1, 1, 'receipt');
--    -- Expected: ERROR: permission denied for function update_stock_balance
--    RESET ROLE;
--
-- 3. DELETE audit:
--    INSERT INTO products (name, unit) VALUES ('test-delete', 'шт') RETURNING id;
--    DELETE FROM products WHERE name = 'test-delete';
--    SELECT * FROM audit_log WHERE action = 'delete' AND entity_type = 'products'
--      ORDER BY created_at DESC LIMIT 1;
--    -- Expected: one row with the deleted_record snapshot.
--
-- 4. Trigram:
--    EXPLAIN ANALYZE SELECT * FROM products WHERE name ILIKE '%мил%';
--    -- Expected: Bitmap Index Scan on idx_products_name_trgm.
--
-- 5. Dedup:
--    INSERT INTO orders (order_number, shop_id, warehouse_id, source, telegram_message_id)
--      VALUES ('TST-1', 1, 1, 'telegram', '999999');
--    INSERT INTO orders (order_number, shop_id, warehouse_id, source, telegram_message_id)
--      VALUES ('TST-2', 1, 1, 'telegram', '999999');
--    -- Expected: second INSERT fails with unique violation on uq_orders_telegram_msg.
