-- ============================================================================
-- Migration 020 — Atomic receipt creation RPC
-- ============================================================================
-- Closes:
--   S7  Frontend was calling next_document_number with anon key; that grant
--       was revoked in 015 and never re-added. Move number allocation into
--       this SECURITY DEFINER RPC so anon can call it safely.
--   L5  receipts/new created the receipt and items in two separate calls,
--       so an INSERT failure on items left an orphan receipt. Now both
--       happen in one transaction.
--
-- After applying, the frontend should call:
--   supabase.rpc('rpc_create_receipt_with_items', {
--     p_supplier_id, p_warehouse_id, p_notes,
--     p_receipt_number,  -- nullable: omit/null → auto-generated
--     p_items            -- JSONB array: [{product_id, quantity, price?}, ...]
--   })
--
-- Returns: { success, receipt_id, receipt_number, items_inserted }
-- On validation error: { success: false, error }
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION household_chemicals.rpc_create_receipt_with_items(
    p_supplier_id    INT,
    p_warehouse_id   INT,
    p_notes          TEXT,
    p_items          JSONB,
    p_receipt_number TEXT DEFAULT NULL,
    p_user_id        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receipt_id     UUID;
    v_receipt_number TEXT;
    v_item           RECORD;
    v_inserted       INT := 0;
    v_warehouse_ok   BOOLEAN;
BEGIN
    -- Validation: warehouse must exist and be active
    SELECT TRUE INTO v_warehouse_ok
    FROM household_chemicals.warehouses
    WHERE id = p_warehouse_id AND COALESCE(is_active, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Склад не знайдено або неактивний');
    END IF;

    -- Validation: items array non-empty
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Накладна повинна містити хоча б один товар');
    END IF;

    -- Allocate number if not provided
    v_receipt_number := NULLIF(TRIM(COALESCE(p_receipt_number, '')), '');
    IF v_receipt_number IS NULL THEN
        v_receipt_number := household_chemicals.next_document_number('RCPT');
    END IF;

    -- Insert receipt header
    INSERT INTO household_chemicals.receipts (
        receipt_number, supplier_id, warehouse_id, notes,
        status, created_by
    ) VALUES (
        v_receipt_number, p_supplier_id, p_warehouse_id, p_notes,
        'draft', p_user_id
    )
    RETURNING id INTO v_receipt_id;

    -- Bulk insert items. Validate per row (quantity > 0) and skip silently
    -- invalid rows? No — fail the transaction so the caller knows.
    FOR v_item IN
        SELECT
            (item->>'product_id')::INT     AS product_id,
            (item->>'quantity')::NUMERIC   AS quantity,
            NULLIF(item->>'price', '')::NUMERIC AS price
        FROM jsonb_array_elements(p_items) AS item
    LOOP
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'Item missing product_id';
        END IF;
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Item % has invalid quantity', v_item.product_id;
        END IF;

        INSERT INTO household_chemicals.receipt_items (
            receipt_id, product_id, quantity, price
        ) VALUES (
            v_receipt_id, v_item.product_id, v_item.quantity, v_item.price
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success',         TRUE,
        'receipt_id',      v_receipt_id,
        'receipt_number',  v_receipt_number,
        'items_inserted',  v_inserted
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_create_receipt_with_items(
    INT, INT, TEXT, JSONB, TEXT, UUID
) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- Post-apply verification
-- ============================================================================
-- 1. Happy path:
--    SELECT household_chemicals.rpc_create_receipt_with_items(
--        NULL, 1, 'test', '[{"product_id": 1, "quantity": 5, "price": 100}]'::jsonb
--    );
--    -- success: true, receipt_id, receipt_number = RCPT-YYYY-NNNNNN
--    -- receipts row in 'draft' status
--    -- receipt_items has 1 row
--
-- 2. Empty items rejected:
--    SELECT household_chemicals.rpc_create_receipt_with_items(NULL, 1, NULL, '[]'::jsonb);
--    -- success: false, error: 'Накладна повинна містити...'
--
-- 3. Bad warehouse rejected:
--    SELECT household_chemicals.rpc_create_receipt_with_items(NULL, 9999, NULL,
--        '[{"product_id": 1, "quantity": 1}]'::jsonb);
--    -- success: false, error: 'Склад не знайдено...'
--
-- 4. Atomicity: pass a bad product_id mid-list, verify NO receipt row exists.
