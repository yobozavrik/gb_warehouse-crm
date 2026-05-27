-- ============================================================================
-- Migration 030 — Unit price tracking in stock_balances (weighted average)
-- ============================================================================
-- Adds unit_price columns to stock_balances and stock_movements, and updates
-- update_stock_balance() to maintain a weighted-average purchase price.
--
-- After applying, every receipt will store the unit price and the balance
-- will track the running weighted average. All existing callers that do NOT
-- pass a price (shipments, write-offs, transfers, corrections) will preserve
-- the current average price unchanged.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add unit_price columns
-- ============================================================================
ALTER TABLE household_chemicals.stock_balances
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2);

ALTER TABLE household_chemicals.stock_movements
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2);

COMMENT ON COLUMN household_chemicals.stock_balances.unit_price
  IS 'Середньозважена закупівельна ціна (unit_price * quantity = балансова вартість)';
COMMENT ON COLUMN household_chemicals.stock_movements.unit_price
  IS 'Закупівельна ціна на момент руху';

-- ============================================================================
-- 2. Rewrite update_stock_balance — price-aware, weighted average
-- ============================================================================

DROP FUNCTION IF EXISTS household_chemicals.update_stock_balance(
  INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) CASCADE;

CREATE OR REPLACE FUNCTION household_chemicals.update_stock_balance(
    p_product_id      INT,
    p_warehouse_id    INT,
    p_quantity_change NUMERIC,
    p_movement_type   TEXT,
    p_reference_type  TEXT DEFAULT NULL,
    p_reference_id    UUID DEFAULT NULL,
    p_notes           TEXT DEFAULT NULL,
    p_created_by      UUID DEFAULT NULL,
    p_unit_price      NUMERIC DEFAULT NULL   -- NEW: цена единицы (для прихода)
) RETURNS NUMERIC(12, 3)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_before      NUMERIC(12, 3);
    v_after       NUMERIC(12, 3);
    v_old_price   NUMERIC(12, 2);
    v_new_price   NUMERIC(12, 2);
    v_total_value NUMERIC(14, 2);
BEGIN
    -- Read current state
    SELECT COALESCE(quantity, 0), unit_price
    INTO v_before, v_old_price
    FROM household_chemicals.stock_balances
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

    v_after := v_before + COALESCE(p_quantity_change, 0);

    -- Calculate new weighted-average price
    IF p_quantity_change > 0 AND p_unit_price IS NOT NULL THEN
        -- Adding stock with a specific price → weighted average
        IF v_before > 0 AND v_old_price IS NOT NULL THEN
            -- Old value + new value / total qty
            v_total_value := (v_before * v_old_price) + (p_quantity_change * p_unit_price);
            v_new_price := ROUND(v_total_value / v_after, 2);
        ELSE
            -- First stock or zero balance → use incoming price
            v_new_price := p_unit_price;
        END IF;
    ELSE
        -- Removing stock, or no price given → keep current price
        v_new_price := v_old_price;
    END IF;

    -- Upsert stock_balances
    INSERT INTO household_chemicals.stock_balances AS sb
        (product_id, warehouse_id, quantity, unit_price, updated_at)
    VALUES (p_product_id, p_warehouse_id, v_after, v_new_price, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity   = v_after,
        unit_price = v_new_price,
        updated_at = NOW();

    -- Log movement
    INSERT INTO household_chemicals.stock_movements (
        product_id, warehouse_id, quantity_change,
        quantity_before, quantity_after,
        unit_price,
        movement_type, reference_type, reference_id, notes, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_quantity_change,
        v_before, v_after,
        v_new_price,
        p_movement_type, p_reference_type, p_reference_id, p_notes, p_created_by
    );

    RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION household_chemicals.update_stock_balance(
  INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, NUMERIC
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION household_chemicals.update_stock_balance(
  INT, INT, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, NUMERIC
) TO service_role;

-- ============================================================================
-- 3. Rewrite confirm_receipt — pass unit price from receipt_items
-- ============================================================================

DROP FUNCTION IF EXISTS household_chemicals.confirm_receipt(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION household_chemicals.confirm_receipt(
    p_receipt_id UUID,
    p_user_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receipt   RECORD;
    v_item      RECORD;
    v_movements INT := 0;
BEGIN
    SELECT * INTO v_receipt
    FROM household_chemicals.receipts
    WHERE id = p_receipt_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
    IF v_receipt.status <> 'draft' THEN
        RAISE EXCEPTION 'Receipt already %', v_receipt.status;
    END IF;

    FOR v_item IN
        SELECT product_id, quantity, price
        FROM household_chemicals.receipt_items
        WHERE receipt_id = p_receipt_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_receipt.warehouse_id, v_item.quantity,
            'receipt', 'receipt', p_receipt_id,
            'Прихід по накладній ' || v_receipt.receipt_number, p_user_id,
            v_item.price       -- ← передаём цену из строки накладной
        );
        v_movements := v_movements + 1;
    END LOOP;

    UPDATE household_chemicals.receipts
    SET status       = 'confirmed',
        confirmed_by = p_user_id,
        confirmed_at = NOW(),
        updated_at   = NOW()
    WHERE id = p_receipt_id
    RETURNING confirmed_at, status INTO v_receipt.confirmed_at, v_receipt.status;

    RETURN jsonb_build_object(
        'success',           TRUE,
        'receipt_id',        p_receipt_id,
        'status',            v_receipt.status,
        'confirmed_at',      v_receipt.confirmed_at,
        'movements_created', v_movements
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_receipt(UUID, UUID) TO anon, authenticated;

-- ============================================================================
-- 4. Update rpc_dashboard_summary — use unit_price for stock_value
-- ============================================================================

DROP FUNCTION IF EXISTS household_chemicals.rpc_dashboard_summary(INT) CASCADE;

CREATE OR REPLACE FUNCTION household_chemicals.rpc_dashboard_summary(
    p_warehouse_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
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
            COALESCE(SUM(sb.quantity * COALESCE(sb.unit_price, p.purchase_price, 0)), 0) AS stock_value,
            COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('submitted', 'confirmed')), 0) AS pending_orders,
            COALESCE(COUNT(DISTINCT s.id) FILTER (WHERE s.shipped_at::date = CURRENT_DATE), 0) AS shipments_today,
            COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'draft'), 0) AS draft_receipts,
            COALESCE(COUNT(DISTINCT w.id), 0) AS active_warehouses
        FROM household_chemicals.warehouses w
        LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id AND (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
        LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
        LEFT JOIN household_chemicals.orders o ON o.warehouse_id = w.id AND o.created_at::date = CURRENT_DATE
        LEFT JOIN household_chemicals.shipments s ON s.warehouse_id = w.id
        LEFT JOIN household_chemicals.receipts r ON r.warehouse_id = w.id
        WHERE (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
    ),
    critical AS (
        SELECT JSONB_AGG(jsonb_build_object(
            'product_id', sb.product_id,
            'product_name', p.name,
            'warehouse_id', sb.warehouse_id,
            'warehouse_name', w.name,
            'quantity', sb.quantity,
            'min_stock', p.min_stock,
            'deficit', p.min_stock - sb.quantity
        ) ORDER BY (p.min_stock - sb.quantity) DESC) AS items
        FROM household_chemicals.stock_balances sb
        JOIN household_chemicals.products p ON p.id = sb.product_id AND p.min_stock IS NOT NULL
        JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
        WHERE sb.quantity <= p.min_stock
        AND (p_warehouse_id IS NULL OR sb.warehouse_id = p_warehouse_id)
    ),
    recent_movements AS (
        SELECT JSONB_AGG(jsonb_build_object(
            'id', sm.id,
            'product_name', p.name,
            'warehouse_name', w.name,
            'quantity_change', sm.quantity_change,
            'movement_type', sm.movement_type,
            'unit_price', sm.unit_price,
            'created_at', sm.created_at
        ) ORDER BY sm.created_at DESC) AS items
        FROM household_chemicals.stock_movements sm
        JOIN household_chemicals.products p ON p.id = sm.product_id
        JOIN household_chemicals.warehouses w ON w.id = sm.warehouse_id
        WHERE (p_warehouse_id IS NULL OR sm.warehouse_id = p_warehouse_id)
        LIMIT 20
    ),
    pending_orders_list AS (
        SELECT JSONB_AGG(jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'shop_name', s.name,
            'status', o.status,
            'items_count', (SELECT COUNT(*) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
            'total_requested', (SELECT COALESCE(SUM(oi.quantity_requested), 0) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
            'created_at', o.created_at
        ) ORDER BY o.created_at DESC) AS items
        FROM household_chemicals.orders o
        JOIN household_chemicals.shops s ON s.id = o.shop_id
        WHERE o.status IN ('submitted', 'confirmed')
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'stats', row_to_json(stats)::jsonb,
        'critical_items', COALESCE(critical.items, '[]'::jsonb),
        'recent_movements', COALESCE(recent_movements.items, '[]'::jsonb),
        'pending_orders', COALESCE(pending_orders_list.items, '[]'::jsonb)
    ) INTO v_result
    FROM stats, critical, recent_movements, pending_orders_list;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_dashboard_summary(INT) TO anon, authenticated;

COMMIT;
