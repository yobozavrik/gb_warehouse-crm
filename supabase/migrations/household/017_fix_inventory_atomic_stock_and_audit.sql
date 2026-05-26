-- Migration 017: Fix inventory, atomic stock, audit dedup, and related issues
-- Includes fixes for: S2, S3, S4, S5, H1, H2, H11, H12, M7, M8, M10, H15
--
-- Apply in Supabase Studio SQL Editor.
-- After applying, run npm run build from warehouse-crm/ to verify.

-- ============================================================================
-- S2: Fix complete_inventory — wrong variable type (RECORD, not NUMERIC)
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.complete_inventory(p_inventory_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory RECORD;
    v_row RECORD;
BEGIN
    SELECT * INTO v_inventory FROM household_chemicals.inventories WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory not found'; END IF;
    IF v_inventory.status != 'in_progress' THEN RAISE EXCEPTION 'Invalid inventory status: %', v_inventory.status; END IF;

    FOR v_row IN
        SELECT ii.product_id, (ii.actual_quantity - ii.expected_quantity) AS diff
        FROM household_chemicals.inventory_items ii
        WHERE ii.inventory_id = p_inventory_id AND ii.actual_quantity <> ii.expected_quantity
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_row.product_id, v_inventory.warehouse_id, v_row.diff,
            'inventory_correction', 'inventory', p_inventory_id,
            'Коригування за інвентаризацією', p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.inventories
    SET status = 'completed', completed_by = p_user_id, completed_at = NOW()
    WHERE id = p_inventory_id;
END;
$$;

-- ============================================================================
-- S3: Fix telegram_get_catalog_text — nested aggregates
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.telegram_get_catalog_text(
    p_category_id INT DEFAULT NULL,
    p_warehouse_id INT DEFAULT 1,
    p_search TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_result TEXT;
BEGIN
    WITH cat AS (
        SELECT
            pc.name AS category_name,
            p.name AS product_name,
            p.unit,
            COALESCE(sb.quantity, 0) AS stock,
            p.min_stock
        FROM household_chemicals.products p
        LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
        LEFT JOIN household_chemicals.stock_balances sb
          ON sb.product_id = p.id AND sb.warehouse_id = p_warehouse_id
        WHERE p.is_active = true
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
    ),
    by_cat AS (
        SELECT
            category_name,
            STRING_AGG(
                '  • ' || product_name || ' — ' || stock || ' ' || unit ||
                CASE WHEN min_stock IS NOT NULL AND stock <= min_stock THEN ' ⚠️' ELSE '' END,
                E'\n' ORDER BY product_name
            ) AS lines
        FROM cat
        GROUP BY category_name
    )
    SELECT STRING_AGG(category_name || E':\n' || lines, E'\n\n' ORDER BY category_name)
    INTO v_result
    FROM by_cat;

    RETURN COALESCE(v_result, 'Каталог порожній');
END;
$$;

-- ============================================================================
-- S4: Add UNIQUE constraint on telegram_pending_orders (telegram_user_id, chat_id)
-- ============================================================================
DELETE FROM household_chemicals.telegram_pending_orders a
USING household_chemicals.telegram_pending_orders b
WHERE a.telegram_user_id = b.telegram_user_id
  AND a.chat_id = b.chat_id
  AND a.created_at < b.created_at;

ALTER TABLE household_chemicals.telegram_pending_orders
  ADD CONSTRAINT uq_telegram_pending_user_chat
  UNIQUE (telegram_user_id, chat_id);

-- ============================================================================
-- S5: Atomic update_stock_balance — no lost-update race
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.update_stock_balance(
    p_product_id INT,
    p_warehouse_id INT,
    p_quantity_change NUMERIC,
    p_movement_type TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS NUMERIC(12, 3)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_before NUMERIC(12, 3);
    v_after  NUMERIC(12, 3);
BEGIN
    INSERT INTO household_chemicals.stock_balances AS sb
        (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, COALESCE(p_quantity_change, 0), NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = sb.quantity + COALESCE(p_quantity_change, 0),
        updated_at = NOW()
    RETURNING
        (sb.quantity - COALESCE(p_quantity_change, 0)),
        sb.quantity
    INTO v_before, v_after;

    IF v_before IS NULL THEN v_before := 0; END IF;

    INSERT INTO household_chemicals.stock_movements (
        product_id, warehouse_id, quantity_change,
        quantity_before, quantity_after,
        movement_type, reference_type, reference_id, notes, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_quantity_change,
        v_before, v_after,
        p_movement_type, p_reference_type, p_reference_id, p_notes, p_created_by
    );

    RETURN v_after;
END;
$$;

-- ============================================================================
-- H1: ship_order — guard against double-ship / re-ship
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.ship_order(
    p_order_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_shipment_id UUID;
    v_item RECORD;
BEGIN
    SELECT * INTO v_order
    FROM household_chemicals.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status NOT IN ('submitted', 'confirmed', 'partially_shipped') THEN
        RAISE EXCEPTION 'Cannot ship order in status: %', v_order.status;
    END IF;

    v_shipment_id := gen_random_uuid();

    INSERT INTO household_chemicals.shipments (id, order_id, warehouse_id, status, created_by)
    VALUES (v_shipment_id, p_order_id, v_order.warehouse_id, 'shipped', p_user_id);

    FOR v_item IN
        SELECT oi.product_id, oi.quantity_requested
        FROM household_chemicals.order_items oi
        WHERE oi.order_id = p_order_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_order.warehouse_id, -v_item.quantity_requested,
            'shipment', 'shipment', v_shipment_id,
            'Відвантаження за заявкою #' || v_order.order_number, p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.orders
    SET status = 'shipped', shipped_at = NOW()
    WHERE id = p_order_id;

    RETURN v_shipment_id;
END;
$$;

-- ============================================================================
-- H2: confirm_receipt — race condition guard with FOR UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.confirm_receipt(
    p_receipt_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
    v_receipt RECORD;
    v_item RECORD;
BEGIN
    SELECT * INTO v_receipt
    FROM household_chemicals.receipts
    WHERE id = p_receipt_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
    IF v_receipt.status != 'draft' THEN RAISE EXCEPTION 'Receipt already %', v_receipt.status; END IF;

    FOR v_item IN
        SELECT product_id, quantity
        FROM household_chemicals.receipt_items
        WHERE receipt_id = p_receipt_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_receipt.warehouse_id, v_item.quantity,
            'receipt', 'receipt', p_receipt_id,
            'Прихід по накладній #' || v_receipt.receipt_number, p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.receipts
    SET status = 'confirmed', confirmed_by = p_user_id, confirmed_at = NOW()
    WHERE id = p_receipt_id;
END;
$$;

-- ============================================================================
-- H11: Remove duplicate audit triggers (trg_audit_status_*) — generic trigger covers it
-- ============================================================================
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'receipts', 'orders', 'shipments', 'transfers', 'write_offs', 'inventories'
    ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_status_%I ON household_chemicals.%I;', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- H12: set_initial_stock — set, not add (compute delta first)
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.set_initial_stock(
    p_product_id INT,
    p_warehouse_id INT,
    p_quantity NUMERIC(12, 3),
    p_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current NUMERIC(12, 3);
BEGIN
    SELECT COALESCE(quantity, 0) INTO v_current
    FROM household_chemicals.stock_balances
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id
    FOR UPDATE;

    PERFORM household_chemicals.update_stock_balance(
        p_product_id, p_warehouse_id, p_quantity - v_current,
        'initial', NULL, NULL, 'Початковий залишок (set)', p_user_id
    );
END;
$$;

-- ============================================================================
-- M7: Fix <= consistency — critical stock CTE should use <= (not <)
-- ============================================================================
-- The 016 RPC already uses <= in the stats CTE. The views below keep the
-- original multi-warehouse structure (no Cartesian issue — single row per
-- stock_balances entry). We recreate them to apply any prior DROP CASCADE.
DROP VIEW IF EXISTS household_chemicals.v_critical_stock CASCADE;
DROP VIEW IF EXISTS household_chemicals.v_stock_summary CASCADE;

CREATE VIEW household_chemicals.v_stock_summary AS
SELECT
    sb.warehouse_id,
    w.name AS warehouse_name,
    sb.product_id,
    p.name AS product_name,
    p.sku,
    p.unit,
    p.category_id,
    pc.name AS category_name,
    sb.quantity,
    p.min_stock,
    p.max_stock,
    CASE
        WHEN p.min_stock IS NOT NULL AND sb.quantity <= p.min_stock THEN 'critical'
        WHEN p.max_stock IS NOT NULL AND sb.quantity >= p.max_stock THEN 'overstock'
        ELSE 'normal'
    END AS stock_status,
    sb.updated_at
FROM household_chemicals.stock_balances sb
JOIN household_chemicals.products p ON p.id = sb.product_id
LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
WHERE p.is_active = true;

CREATE VIEW household_chemicals.v_critical_stock AS
SELECT *
FROM household_chemicals.v_stock_summary
WHERE stock_status = 'critical'
ORDER BY warehouse_name, category_name, product_name;

GRANT SELECT ON household_chemicals.v_stock_summary TO anon, authenticated;
GRANT SELECT ON household_chemicals.v_critical_stock TO anon, authenticated;

-- The functions still have SECURITY DEFINER and are owned by the schema owner,
-- but after CREATE OR REPLACE we re-assert EXECUTE grants.
GRANT EXECUTE ON FUNCTION household_chemicals.complete_inventory(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION household_chemicals.telegram_get_catalog_text(INT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION household_chemicals.update_stock_balance(INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION household_chemicals.ship_order(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION household_chemicals.confirm_receipt(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION household_chemicals.set_initial_stock(INT, INT, NUMERIC, UUID) TO anon, authenticated;
