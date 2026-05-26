-- ============================================================================
-- Migration 018 — Atomic operations for pending orders and edited messages
-- Fixes H3 (atomic edited-message replace) and H8 (atomic pending-order add)
-- ============================================================================
-- How to apply: Copy-paste into Supabase Studio SQL Editor, run once.
-- DANGER: All DROP below use CASCADE — re-run GRANTs after.
-- ============================================================================

BEGIN;

-- ============================================================================
-- H8: Atomic pending-order add item (avoid read-modify-write race)
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_pending_order_add_item(
    p_telegram_user_id INT,
    p_chat_id BIGINT,
    p_product_id INT,
    p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_items JSONB;
    v_existing_idx INT;
BEGIN
    SELECT items INTO v_items
    FROM household_chemicals.telegram_pending_orders
    WHERE telegram_user_id = p_telegram_user_id AND chat_id = p_chat_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending order not found');
    END IF;

    -- Merge: if same product_id exists, add to its quantity
    v_existing_idx := (
        SELECT idx FROM (
            SELECT idx, item->>'product_id' AS pid
            FROM jsonb_array_elements(v_items) WITH ORDINALITY AS arr(item, idx)
        ) sub
        WHERE pid = p_product_id::TEXT
        LIMIT 1
    );

    IF v_existing_idx IS NOT NULL THEN
        v_items := jsonb_set(
            v_items,
            ARRAY[v_existing_idx - 1, 'quantity'],
            to_jsonb(COALESCE((v_items->>(v_existing_idx - 1))->>'quantity', '0')::INT + p_quantity)
        );
    ELSE
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'product_id', p_product_id,
            'quantity', p_quantity
        ));
    END IF;

    UPDATE household_chemicals.telegram_pending_orders
    SET items = v_items, step = 'adding_items'
    WHERE telegram_user_id = p_telegram_user_id AND chat_id = p_chat_id;

    RETURN jsonb_build_object('success', true, 'items', v_items);
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_pending_order_add_item(INT, BIGINT, INT, INT) TO anon, authenticated;

-- ============================================================================
-- H3: Atomic replace order items (DELETE + bulk INSERT in one transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_telegram_replace_order_items(
    p_order_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_inserted INT := 0;
BEGIN
    -- Lock the order row to prevent concurrent edits
    PERFORM id FROM household_chemicals.orders WHERE id = p_order_id FOR UPDATE;

    -- Delete old items
    DELETE FROM household_chemicals.order_items WHERE order_id = p_order_id;

    -- Bulk insert new items from JSONB array
    FOR v_item IN
        SELECT (item->>'product_id')::INT AS product_id,
               (item->>'quantity')::NUMERIC AS quantity_requested
        FROM jsonb_array_elements(p_items) AS item
    LOOP
        INSERT INTO household_chemicals.order_items (order_id, product_id, quantity_requested)
        VALUES (p_order_id, v_item.product_id, v_item.quantity_requested);
        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_telegram_replace_order_items(UUID, JSONB) TO anon, authenticated;

COMMIT;
