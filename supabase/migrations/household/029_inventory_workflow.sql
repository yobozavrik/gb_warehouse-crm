-- ============================================================================
-- Migration 029 — Inventory workflow RPCs
-- ============================================================================
-- Adds a usable workflow on top of the bare `inventories` / `inventory_items`
-- tables from migration 001:
--   • rpc_create_inventory — opens a session and pre-fills items from
--     current stock_balances (actual = expected by default).
--   • rpc_inventory_detail — header + items + stats for the page.
--   • rpc_inventory_set_actual — update one row.
--   • rpc_inventory_add_product — add a product that wasn't in the books.
--   • rpc_inventory_resort — explicit re-grade between two products in a
--     single call; both rows get a shared notes marker.
--   • rpc_inventory_cancel — mark as cancelled (no stock effect).
-- Plus:
--   • UNIQUE constraint on inventory_items(inventory_id, product_id) so the
--     same product can't appear twice in one session.
--   • complete_inventory now picks up `ii.notes` so resort/extra rows keep
--     their context in stock_movements.notes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Schema: one product per inventory (the "add product" RPC relies on this).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'household_chemicals'
          AND t.relname = 'inventory_items'
          AND c.conname = 'uq_inventory_items_inv_prod'
    ) THEN
        ALTER TABLE household_chemicals.inventory_items
          ADD CONSTRAINT uq_inventory_items_inv_prod
          UNIQUE (inventory_id, product_id);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- rpc_create_inventory: open a session and pre-fill items
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_create_inventory(
    p_warehouse_id INT,
    p_notes        TEXT DEFAULT NULL,
    p_user_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory_id     UUID;
    v_inventory_number TEXT;
    v_items_seeded     INT := 0;
    v_warehouse_ok     BOOLEAN;
BEGIN
    SELECT TRUE INTO v_warehouse_ok
    FROM household_chemicals.warehouses
    WHERE id = p_warehouse_id AND COALESCE(is_active, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Склад не знайдено або неактивний');
    END IF;

    v_inventory_number := household_chemicals.next_document_number('INV');

    INSERT INTO household_chemicals.inventories (
        inventory_number, warehouse_id, status, notes, created_by
    ) VALUES (
        v_inventory_number, p_warehouse_id, 'in_progress', p_notes, p_user_id
    )
    RETURNING id INTO v_inventory_id;

    -- Seed items from current stock_balances. actual defaults to expected so
    -- only changed rows show up as discrepancies later.
    INSERT INTO household_chemicals.inventory_items (
        inventory_id, product_id, expected_quantity, actual_quantity
    )
    SELECT
        v_inventory_id,
        sb.product_id,
        COALESCE(sb.quantity, 0),
        COALESCE(sb.quantity, 0)
    FROM household_chemicals.stock_balances sb
    JOIN household_chemicals.products p ON p.id = sb.product_id AND p.is_active = TRUE
    WHERE sb.warehouse_id = p_warehouse_id;

    GET DIAGNOSTICS v_items_seeded = ROW_COUNT;

    RETURN jsonb_build_object(
        'success',          TRUE,
        'inventory_id',     v_inventory_id,
        'inventory_number', v_inventory_number,
        'items_seeded',     v_items_seeded
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_create_inventory(INT, TEXT, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- rpc_inventory_detail: header + items + summary stats
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_inventory_detail(p_inventory_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_inventory JSONB;
    v_items     JSONB;
    v_stats     JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id',               i.id,
        'inventory_number', i.inventory_number,
        'warehouse_id',     i.warehouse_id,
        'warehouse_name',   w.name,
        'status',           i.status,
        'notes',            i.notes,
        'created_at',       i.created_at,
        'completed_at',     i.completed_at
    ) INTO v_inventory
    FROM household_chemicals.inventories i
    JOIN household_chemicals.warehouses w ON w.id = i.warehouse_id
    WHERE i.id = p_inventory_id;

    IF v_inventory IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація не знайдена');
    END IF;

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id',                ii.id,
        'product_id',        ii.product_id,
        'product_name',      p.name,
        'sku',               p.sku,
        'unit',              p.unit,
        'category_id',       p.category_id,
        'category_name',     pc.name,
        'expected_quantity', ii.expected_quantity,
        'actual_quantity',   ii.actual_quantity,
        'difference',        ii.difference,
        'notes',             ii.notes
    ) ORDER BY pc.name, p.name), '[]'::jsonb)
    INTO v_items
    FROM household_chemicals.inventory_items ii
    JOIN household_chemicals.products p           ON p.id = ii.product_id
    LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
    WHERE ii.inventory_id = p_inventory_id;

    SELECT jsonb_build_object(
        'total_positions',  COUNT(*),
        'with_diff',        COUNT(*) FILTER (WHERE ii.difference <> 0),
        'surplus_count',    COUNT(*) FILTER (WHERE ii.difference > 0),
        'shortage_count',   COUNT(*) FILTER (WHERE ii.difference < 0),
        'surplus_units',    COALESCE(SUM(GREATEST(ii.difference, 0)), 0),
        'shortage_units',   COALESCE(SUM(-LEAST(ii.difference, 0)), 0)
    ) INTO v_stats
    FROM household_chemicals.inventory_items ii
    WHERE ii.inventory_id = p_inventory_id;

    RETURN jsonb_build_object(
        'success',   TRUE,
        'inventory', v_inventory,
        'items',     v_items,
        'stats',     v_stats
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_inventory_detail(UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- rpc_inventory_set_actual: update one row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_inventory_set_actual(
    p_item_id          UUID,
    p_actual_quantity  NUMERIC(12, 3),
    p_notes            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_status TEXT;
    v_difference NUMERIC(12, 3);
BEGIN
    IF p_actual_quantity IS NULL OR p_actual_quantity < 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Кількість має бути ≥ 0');
    END IF;

    SELECT i.status INTO v_inv_status
    FROM household_chemicals.inventory_items ii
    JOIN household_chemicals.inventories i ON i.id = ii.inventory_id
    WHERE ii.id = p_item_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Рядок не знайдено');
    END IF;
    IF v_inv_status <> 'in_progress' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація вже завершена або скасована');
    END IF;

    UPDATE household_chemicals.inventory_items
    SET actual_quantity = p_actual_quantity,
        notes           = COALESCE(p_notes, notes)
    WHERE id = p_item_id
    RETURNING difference INTO v_difference;

    RETURN jsonb_build_object(
        'success',          TRUE,
        'item_id',          p_item_id,
        'actual_quantity',  p_actual_quantity,
        'difference',       v_difference
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_inventory_set_actual(UUID, NUMERIC, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- rpc_inventory_add_product: add a product that wasn't in stock_balances yet.
-- expected = current balance (or 0), actual = whatever was actually counted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_inventory_add_product(
    p_inventory_id     UUID,
    p_product_id       INT,
    p_actual_quantity  NUMERIC(12, 3)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv          RECORD;
    v_expected     NUMERIC(12, 3);
    v_existing_id  UUID;
    v_item_id      UUID;
BEGIN
    IF p_actual_quantity IS NULL OR p_actual_quantity < 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Кількість має бути ≥ 0');
    END IF;

    SELECT * INTO v_inv
    FROM household_chemicals.inventories
    WHERE id = p_inventory_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація не знайдена');
    END IF;
    IF v_inv.status <> 'in_progress' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація вже завершена або скасована');
    END IF;

    -- If the item already exists in this inventory — just update actual.
    SELECT id INTO v_existing_id
    FROM household_chemicals.inventory_items
    WHERE inventory_id = p_inventory_id AND product_id = p_product_id;

    IF v_existing_id IS NOT NULL THEN
        UPDATE household_chemicals.inventory_items
        SET actual_quantity = p_actual_quantity
        WHERE id = v_existing_id;
        RETURN jsonb_build_object('success', TRUE, 'item_id', v_existing_id, 'updated_existing', TRUE);
    END IF;

    -- Otherwise: take current balance as expected (0 if product never seen).
    SELECT COALESCE(quantity, 0) INTO v_expected
    FROM household_chemicals.stock_balances
    WHERE product_id = p_product_id AND warehouse_id = v_inv.warehouse_id;
    v_expected := COALESCE(v_expected, 0);

    INSERT INTO household_chemicals.inventory_items (
        inventory_id, product_id, expected_quantity, actual_quantity
    ) VALUES (
        p_inventory_id, p_product_id, v_expected, p_actual_quantity
    )
    RETURNING id INTO v_item_id;

    RETURN jsonb_build_object(
        'success',          TRUE,
        'item_id',          v_item_id,
        'expected',         v_expected,
        'actual',           p_actual_quantity,
        'updated_existing', FALSE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_inventory_add_product(UUID, INT, NUMERIC) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- rpc_inventory_resort: explicit "re-grade" between two products.
--   from_product: actual -= qty
--   to_product:   actual += qty
-- Both rows get a shared notes marker so stock_movements later carry it.
-- If the from/to product has no row yet, it's added (expected = current
-- balance, then the +/- qty is applied).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_inventory_resort(
    p_inventory_id      UUID,
    p_from_product_id   INT,
    p_to_product_id     INT,
    p_quantity          NUMERIC(12, 3),
    p_notes             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv         RECORD;
    v_from_item   RECORD;
    v_to_item     RECORD;
    v_marker      TEXT;
    v_from_name   TEXT;
    v_to_name     TEXT;
    v_expected    NUMERIC(12, 3);
BEGIN
    IF p_from_product_id = p_to_product_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'З і ДО мають бути різні товари');
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Кількість має бути > 0');
    END IF;

    SELECT * INTO v_inv FROM household_chemicals.inventories
    WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація не знайдена'); END IF;
    IF v_inv.status <> 'in_progress' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація вже завершена або скасована');
    END IF;

    SELECT name INTO v_from_name FROM household_chemicals.products WHERE id = p_from_product_id;
    SELECT name INTO v_to_name   FROM household_chemicals.products WHERE id = p_to_product_id;
    IF v_from_name IS NULL OR v_to_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Товар не знайдено');
    END IF;

    v_marker := 'Пересорт: ' || v_from_name || ' → ' || v_to_name || ' (' || p_quantity || ')'
                || COALESCE(' | ' || p_notes, '');

    -- FROM side
    SELECT * INTO v_from_item FROM household_chemicals.inventory_items
    WHERE inventory_id = p_inventory_id AND product_id = p_from_product_id;
    IF NOT FOUND THEN
        SELECT COALESCE(quantity, 0) INTO v_expected FROM household_chemicals.stock_balances
        WHERE product_id = p_from_product_id AND warehouse_id = v_inv.warehouse_id;
        v_expected := COALESCE(v_expected, 0);
        IF v_expected - p_quantity < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error',
                'Недостатньо ' || v_from_name || ' на складі для пересорту (' || v_expected || ')');
        END IF;
        INSERT INTO household_chemicals.inventory_items
            (inventory_id, product_id, expected_quantity, actual_quantity, notes)
        VALUES (p_inventory_id, p_from_product_id, v_expected, v_expected - p_quantity, v_marker);
    ELSE
        IF v_from_item.actual_quantity - p_quantity < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error',
                'Недостатньо ' || v_from_name || ' для пересорту (фактично ' || v_from_item.actual_quantity || ')');
        END IF;
        UPDATE household_chemicals.inventory_items
        SET actual_quantity = actual_quantity - p_quantity,
            notes           = v_marker
        WHERE id = v_from_item.id;
    END IF;

    -- TO side
    SELECT * INTO v_to_item FROM household_chemicals.inventory_items
    WHERE inventory_id = p_inventory_id AND product_id = p_to_product_id;
    IF NOT FOUND THEN
        SELECT COALESCE(quantity, 0) INTO v_expected FROM household_chemicals.stock_balances
        WHERE product_id = p_to_product_id AND warehouse_id = v_inv.warehouse_id;
        v_expected := COALESCE(v_expected, 0);
        INSERT INTO household_chemicals.inventory_items
            (inventory_id, product_id, expected_quantity, actual_quantity, notes)
        VALUES (p_inventory_id, p_to_product_id, v_expected, v_expected + p_quantity, v_marker);
    ELSE
        UPDATE household_chemicals.inventory_items
        SET actual_quantity = actual_quantity + p_quantity,
            notes           = v_marker
        WHERE id = v_to_item.id;
    END IF;

    RETURN jsonb_build_object(
        'success',  TRUE,
        'from',     jsonb_build_object('product_id', p_from_product_id, 'name', v_from_name),
        'to',       jsonb_build_object('product_id', p_to_product_id,   'name', v_to_name),
        'quantity', p_quantity,
        'marker',   v_marker
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_inventory_resort(UUID, INT, INT, NUMERIC, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- rpc_inventory_cancel: discard the session (no stock effect)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.rpc_inventory_cancel(p_inventory_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM household_chemicals.inventories
    WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'Інвентаризація не знайдена'); END IF;
    IF v_status <> 'in_progress' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Можна скасувати лише ту, що в процесі');
    END IF;

    UPDATE household_chemicals.inventories
    SET status = 'cancelled', completed_at = NOW()
    WHERE id = p_inventory_id;

    RETURN jsonb_build_object('success', TRUE, 'inventory_id', p_inventory_id, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_inventory_cancel(UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- complete_inventory: pick up ii.notes so resort markers reach stock_movements
-- (signature unchanged from migration 025)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.complete_inventory(
    p_inventory_id UUID,
    p_user_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory   RECORD;
    v_row         RECORD;
    v_corrections INT := 0;
    v_notes       TEXT;
BEGIN
    SELECT * INTO v_inventory FROM household_chemicals.inventories
    WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory not found'; END IF;
    IF v_inventory.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Invalid inventory status: %', v_inventory.status;
    END IF;

    FOR v_row IN
        SELECT ii.product_id, ii.notes,
               (ii.actual_quantity - ii.expected_quantity) AS diff
        FROM household_chemicals.inventory_items ii
        WHERE ii.inventory_id = p_inventory_id
          AND ii.actual_quantity <> ii.expected_quantity
    LOOP
        v_notes := COALESCE(NULLIF(v_row.notes, ''), 'Коригування за інвентаризацією');
        PERFORM household_chemicals.update_stock_balance(
            v_row.product_id, v_inventory.warehouse_id, v_row.diff,
            'inventory_correction', 'inventory', p_inventory_id,
            v_notes, p_user_id
        );
        v_corrections := v_corrections + 1;
    END LOOP;

    UPDATE household_chemicals.inventories
    SET status = 'completed', completed_by = p_user_id, completed_at = NOW()
    WHERE id = p_inventory_id;

    RETURN jsonb_build_object(
        'success',             TRUE,
        'inventory_id',        p_inventory_id,
        'status',              'completed',
        'completed_at',        NOW(),
        'corrections_applied', v_corrections
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.complete_inventory(UUID, UUID) TO anon, authenticated;

COMMIT;
