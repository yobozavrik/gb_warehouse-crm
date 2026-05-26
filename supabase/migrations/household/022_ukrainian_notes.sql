-- ============================================================================
-- Migration 022 — Ukrainian notes in stock movement functions
-- ============================================================================
-- Closes L8: confirm_transfer and confirm_write_off wrote Russian strings into
-- stock_movements.notes. Audit page (Ukrainian UI) showed mixed-language data.
-- Aligns them with confirm_receipt / complete_inventory / ship_order which
-- were already moved to Ukrainian in earlier migrations.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION household_chemicals.confirm_transfer(
    p_transfer_id UUID,
    p_user_id     UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item     RECORD;
BEGIN
    SELECT * INTO v_transfer
    FROM household_chemicals.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.status <> 'draft' THEN
        RAISE EXCEPTION 'Transfer already %', v_transfer.status;
    END IF;

    -- Списання з джерела
    FOR v_item IN
        SELECT product_id, quantity FROM household_chemicals.transfer_items
        WHERE transfer_id = p_transfer_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_transfer.from_warehouse_id, -v_item.quantity,
            'transfer_out', 'transfer', p_transfer_id,
            'Переміщення: списання з джерела', p_user_id
        );
    END LOOP;

    -- Оприбуткування на отримувачі
    FOR v_item IN
        SELECT product_id, quantity FROM household_chemicals.transfer_items
        WHERE transfer_id = p_transfer_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_item.product_id, v_transfer.to_warehouse_id, v_item.quantity,
            'transfer_in', 'transfer', p_transfer_id,
            'Переміщення: оприбуткування на отримувачі', p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.transfers
    SET status = 'completed',
        confirmed_by = p_user_id,
        completed_at = NOW()
    WHERE id = p_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_transfer(UUID, UUID) TO anon, authenticated;


CREATE OR REPLACE FUNCTION household_chemicals.confirm_write_off(
    p_write_off_id UUID,
    p_user_id      UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_write_off RECORD;
    v_item      RECORD;
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
    END LOOP;

    UPDATE household_chemicals.write_offs
    SET status = 'confirmed',
        confirmed_by = p_user_id,
        confirmed_at = NOW()
    WHERE id = p_write_off_id;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.confirm_write_off(UUID, UUID) TO anon, authenticated;

COMMIT;
