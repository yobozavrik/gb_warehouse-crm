-- ============================================================================
-- Migration 025 — confirm_* / complete_inventory return JSONB
-- ============================================================================
-- Closes L9: previously these RPCs returned void, so the frontend had to
-- re-fetch the whole list to learn the new status / timestamp. Now each
-- returns a small JSONB with the fields the UI needs to do a local row
-- update (status, confirmed_at / completed_at, movement count, etc).
--
-- Signature change → DROP + CREATE (not just CREATE OR REPLACE).
-- Frontend (api.ts) gets matching TypeScript types.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- confirm_receipt
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS household_chemicals.confirm_receipt(UUID, UUID);

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
        SELECT product_id, quantity
        FROM household_chemicals.receipt_items
        WHERE receipt_id = p_receipt_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_receipt.warehouse_id, v_item.quantity,
            'receipt', 'receipt', p_receipt_id,
            'Прихід по накладній ' || v_receipt.receipt_number, p_user_id
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


-- ----------------------------------------------------------------------------
-- confirm_transfer
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS household_chemicals.confirm_transfer(UUID, UUID);

CREATE OR REPLACE FUNCTION household_chemicals.confirm_transfer(
    p_transfer_id UUID,
    p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer  RECORD;
    v_item      RECORD;
    v_movements INT := 0;
BEGIN
    SELECT * INTO v_transfer
    FROM household_chemicals.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.status <> 'draft' THEN
        RAISE EXCEPTION 'Transfer already %', v_transfer.status;
    END IF;

    FOR v_item IN
        SELECT product_id, quantity FROM household_chemicals.transfer_items
        WHERE transfer_id = p_transfer_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_transfer.from_warehouse_id, -v_item.quantity,
            'transfer_out', 'transfer', p_transfer_id,
            'Переміщення: списання з джерела', p_user_id
        );
        v_movements := v_movements + 1;
    END LOOP;

    FOR v_item IN
        SELECT product_id, quantity FROM household_chemicals.transfer_items
        WHERE transfer_id = p_transfer_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_transfer.to_warehouse_id, v_item.quantity,
            'transfer_in', 'transfer', p_transfer_id,
            'Переміщення: оприбуткування на отримувачі', p_user_id
        );
        v_movements := v_movements + 1;
    END LOOP;

    UPDATE household_chemicals.transfers
    SET status       = 'completed',
        confirmed_by = p_user_id,
        completed_at = NOW()
    WHERE id = p_transfer_id
    RETURNING completed_at, status INTO v_transfer.completed_at, v_transfer.status;

    RETURN jsonb_build_object(
        'success',           TRUE,
        'transfer_id',       p_transfer_id,
        'status',            v_transfer.status,
        'completed_at',      v_transfer.completed_at,
        'movements_created', v_movements
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_transfer(UUID, UUID) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- confirm_write_off
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS household_chemicals.confirm_write_off(UUID, UUID);

CREATE OR REPLACE FUNCTION household_chemicals.confirm_write_off(
    p_write_off_id UUID,
    p_user_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_write_off RECORD;
    v_item      RECORD;
    v_movements INT := 0;
BEGIN
    SELECT * INTO v_write_off
    FROM household_chemicals.write_offs
    WHERE id = p_write_off_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Write-off not found'; END IF;
    IF v_write_off.status <> 'draft' THEN
        RAISE EXCEPTION 'Write-off already %', v_write_off.status;
    END IF;

    FOR v_item IN
        SELECT product_id, quantity FROM household_chemicals.write_off_items
        WHERE write_off_id = p_write_off_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_write_off.warehouse_id, -v_item.quantity,
            'write_off', 'write_off', p_write_off_id,
            'Списання: ' || v_write_off.reason, p_user_id
        );
        v_movements := v_movements + 1;
    END LOOP;

    UPDATE household_chemicals.write_offs
    SET status       = 'confirmed',
        confirmed_by = p_user_id,
        confirmed_at = NOW()
    WHERE id = p_write_off_id
    RETURNING confirmed_at, status INTO v_write_off.confirmed_at, v_write_off.status;

    RETURN jsonb_build_object(
        'success',           TRUE,
        'write_off_id',      p_write_off_id,
        'status',            v_write_off.status,
        'confirmed_at',      v_write_off.confirmed_at,
        'movements_created', v_movements
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_write_off(UUID, UUID) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- complete_inventory
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS household_chemicals.complete_inventory(UUID, UUID);

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
BEGIN
    SELECT * INTO v_inventory
    FROM household_chemicals.inventories
    WHERE id = p_inventory_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory not found'; END IF;
    IF v_inventory.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Invalid inventory status: %', v_inventory.status;
    END IF;

    FOR v_row IN
        SELECT ii.product_id, (ii.actual_quantity - ii.expected_quantity) AS diff
        FROM household_chemicals.inventory_items ii
        WHERE ii.inventory_id = p_inventory_id
          AND ii.actual_quantity <> ii.expected_quantity
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_row.product_id, v_inventory.warehouse_id, v_row.diff,
            'inventory_correction', 'inventory', p_inventory_id,
            'Коригування за інвентаризацією', p_user_id
        );
        v_corrections := v_corrections + 1;
    END LOOP;

    UPDATE household_chemicals.inventories
    SET status       = 'completed',
        completed_by = p_user_id,
        completed_at = NOW()
    WHERE id = p_inventory_id
    RETURNING completed_at, status INTO v_inventory.completed_at, v_inventory.status;

    RETURN jsonb_build_object(
        'success',             TRUE,
        'inventory_id',        p_inventory_id,
        'status',              v_inventory.status,
        'completed_at',        v_inventory.completed_at,
        'corrections_applied', v_corrections
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.complete_inventory(UUID, UUID) TO anon, authenticated;

COMMIT;
