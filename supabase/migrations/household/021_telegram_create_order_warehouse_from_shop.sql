-- ============================================================================
-- Migration 021 — telegram_create_order: derive warehouse from shop if NULL
-- ============================================================================
-- Closes H13: removes hardcoded `DEFAULT 1` for p_warehouse_id. The function
-- now derives the warehouse from shops.warehouse_id when the caller passes
-- NULL. Raises an exception if neither is provided.
--
-- Frontend already calls getWarehouseForShop() and passes the result, so this
-- migration is a safety net for any other callers that might omit it.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS household_chemicals.telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION household_chemicals.telegram_create_order(
    p_telegram_user_id    INT,
    p_shop_id             INT,
    p_warehouse_id        INT DEFAULT NULL,    -- was: DEFAULT 1
    p_items               JSONB DEFAULT '[]'::jsonb,
    p_notes               TEXT DEFAULT NULL,
    p_telegram_message_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id          UUID;
    v_order_number      TEXT;
    v_household_user_id UUID;
    v_warehouse_id      INT;
    v_item              RECORD;
    v_product           household_chemicals.products%ROWTYPE;
    v_errors            JSONB := '[]'::jsonb;
    v_created_items     INT := 0;
BEGIN
    -- Determine warehouse: explicit arg → shop's warehouse_id → fail
    v_warehouse_id := p_warehouse_id;
    IF v_warehouse_id IS NULL THEN
        SELECT warehouse_id INTO v_warehouse_id
        FROM household_chemicals.shops
        WHERE id = p_shop_id;
    END IF;
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Cannot determine warehouse for shop %', p_shop_id;
    END IF;

    -- Get household_user_id from telegram_users
    SELECT household_user_id INTO v_household_user_id
    FROM household_chemicals.telegram_users
    WHERE id = p_telegram_user_id;

    -- Generate order number
    v_order_number := household_chemicals.next_document_number('ORD');

    -- Create order
    INSERT INTO household_chemicals.orders (
        order_number, shop_id, warehouse_id, status, source,
        telegram_message_id, notes, created_by
    ) VALUES (
        v_order_number, p_shop_id, v_warehouse_id, 'submitted', 'telegram',
        p_telegram_message_id, p_notes, v_household_user_id
    ) RETURNING id INTO v_order_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id INT, quantity NUMERIC)
    LOOP
        SELECT * INTO v_product FROM household_chemicals.products WHERE id = v_item.product_id AND is_active = true;

        IF NOT FOUND THEN
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_item.product_id,
                'error', 'Товар не знайдено або неактивний'
            );
            CONTINUE;
        END IF;

        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_item.product_id,
                'product_name', v_product.name,
                'error', 'Кількість повинна бути більше 0'
            );
            CONTINUE;
        END IF;

        INSERT INTO household_chemicals.order_items (order_id, product_id, quantity_requested)
        VALUES (v_order_id, v_item.product_id, v_item.quantity);

        v_created_items := v_created_items + 1;
    END LOOP;

    -- If no valid items, cancel the order
    IF v_created_items = 0 THEN
        DELETE FROM household_chemicals.orders WHERE id = v_order_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Не вдалося створити заявку: немає коректних товарів',
            'errors', v_errors
        );
    END IF;

    -- Audit log
    PERFORM household_chemicals.log_action(
        v_household_user_id, 'create', 'orders', v_order_id::TEXT,
        jsonb_build_object('source', 'telegram', 'shop_id', p_shop_id, 'items_count', v_created_items),
        'Заявка створена через Telegram: ' || v_order_number
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'items_created', v_created_items,
        'errors', v_errors
    );
END;
$$;

REVOKE ALL ON FUNCTION household_chemicals.telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION household_chemicals.telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT) TO service_role;

COMMIT;
