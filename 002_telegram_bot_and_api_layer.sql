-- ============================================================================
-- Миграция №2: Telegram Bot + API Integration Layer
-- Зависит от: 20260522_full_warehouse_schema.sql
-- ============================================================================

-- ============================================================================
-- A. ТЕЛЕГРАМ БОТ — ТАБЛИЦЫ
-- ============================================================================

-- A.1 Зарегистрированные чаты/группы
CREATE TABLE IF NOT EXISTS household_chemicals.telegram_chats (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    title TEXT,
    type TEXT NOT NULL CHECK (type IN ('group', 'supergroup', 'private', 'channel')),
    warehouse_id INT REFERENCES household_chemicals.warehouses(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_chats_chat_id ON household_chemicals.telegram_chats(chat_id);

-- A.2 Пользователи Telegram (привязка к сотрудникам)
CREATE TABLE IF NOT EXISTS household_chemicals.telegram_users (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    household_user_id UUID REFERENCES household_chemicals.users(id),
    is_active BOOLEAN DEFAULT true,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_user_id ON household_chemicals.telegram_users(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_household ON household_chemicals.telegram_users(household_user_id);

-- A.3 Черновики заявок (пока продавец набирает в Telegram)
CREATE TABLE IF NOT EXISTS household_chemicals.telegram_pending_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id INT NOT NULL REFERENCES household_chemicals.telegram_users(id),
    chat_id BIGINT NOT NULL,
    step TEXT NOT NULL DEFAULT 'start' CHECK (step IN (
        'start', 'selecting_shop', 'adding_items', 'confirming'
    )),
    shop_id INT REFERENCES household_chemicals.shops(id),
    items JSONB DEFAULT '[]'::jsonb,
    message_id INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_pending_user ON household_chemicals.telegram_pending_orders(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_chat ON household_chemicals.telegram_pending_orders(chat_id);

-- A.4 Лог всех сообщений Telegram
CREATE TABLE IF NOT EXISTS household_chemicals.telegram_messages_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id INT REFERENCES household_chemicals.telegram_users(id),
    chat_id BIGINT NOT NULL,
    message_id INT,
    message_type TEXT NOT NULL CHECK (message_type IN (
        'text', 'photo', 'document', 'callback_query', 'command', 'sticker', 'voice', 'other'
    )),
    text_content TEXT,
    parsed_command TEXT,
    parsed_data JSONB,
    ai_response TEXT,
    processing_time_ms INT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_log_chat ON household_chemicals.telegram_messages_log(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_log_user ON household_chemicals.telegram_messages_log(telegram_user_id);


-- ============================================================================
-- B. API INTEGRATION LAYER — ТАБЛИЦЫ
-- ============================================================================

-- B.1 Лог всех API-вызовов (для аудита интеграций)
CREATE TABLE IF NOT EXISTS household_chemicals.api_integration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    method TEXT,
    endpoint TEXT,
    request_headers JSONB,
    request_body JSONB,
    response_status INT,
    response_body JSONB,
    source TEXT NOT NULL CHECK (source IN ('poster', 'crm', 'telegram', 'internal', 'external_webhook')),
    duration_ms INT,
    error_message TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_log_source ON household_chemicals.api_integration_log(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_log_status ON household_chemicals.api_integration_log(response_status);

-- B.2 Очередь исходящих вебхуков (для отправки событий в CRM/ERP)
CREATE TABLE IF NOT EXISTS household_chemicals.webhook_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    target_url TEXT,
    target_system TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON household_chemicals.webhook_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_type ON household_chemicals.webhook_outbox(event_type);

-- B.3 Статус синхронизации с внешними системами
CREATE TABLE IF NOT EXISTS household_chemicals.sync_status (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'success', 'error')),
    error_message TEXT,
    rows_processed INT DEFAULT 0,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, entity_type)
);

-- B.4 Номерная нумерация документов (автоинкрементные номера)
CREATE TABLE IF NOT EXISTS household_chemicals.document_sequences (
    id SERIAL PRIMARY KEY,
    prefix TEXT NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    UNIQUE(prefix, year)
);

-- Функция получения следующего номера документа
CREATE OR REPLACE FUNCTION household_chemicals.next_document_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    v_next INT;
BEGIN
    INSERT INTO household_chemicals.document_sequences (prefix, year, last_number)
    VALUES (p_prefix, v_year, 1)
    ON CONFLICT (prefix, year)
    DO UPDATE SET last_number = household_chemicals.document_sequences.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN p_prefix || '-' || v_year || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;


-- ============================================================================
-- C. ДОПОЛНИТЕЛЬНЫЕ RPC-ФУНКЦИИ ДЛЯ ДАШБОРДА
-- ============================================================================

-- C.1 Сводка для дашборда кладовщика (всё в одном вызове)
CREATE OR REPLACE FUNCTION household_chemicals.rpc_dashboard_summary(
    p_warehouse_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- C.2 Список заявок с фильтрацией и пагинацией
CREATE OR REPLACE FUNCTION household_chemicals.rpc_orders_list(
    p_status TEXT DEFAULT NULL,
    p_warehouse_id INT DEFAULT NULL,
    p_shop_id INT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset INT := (p_page - 1) * p_page_size;
    v_total INT;
    v_items JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM household_chemicals.v_orders_with_details
    WHERE (p_status IS NULL OR status = p_status)
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_shop_id IS NULL OR shop_id = p_shop_id)
      AND (p_source IS NULL OR source = p_source)
      AND (p_date_from IS NULL OR created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR created_at::date <= p_date_to);

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', id,
        'order_number', order_number,
        'shop_id', shop_id,
        'shop_name', shop_name,
        'warehouse_id', warehouse_id,
        'warehouse_name', warehouse_name,
        'status', status,
        'source', source,
        'notes', notes,
        'created_by_name', created_by_name,
        'items_count', items_count,
        'total_requested', total_requested,
        'total_shipped', total_shipped,
        'submitted_at', submitted_at,
        'confirmed_at', confirmed_at,
        'shipped_at', shipped_at,
        'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_items
    FROM household_chemicals.v_orders_with_details
    WHERE (p_status IS NULL OR status = p_status)
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_shop_id IS NULL OR shop_id = p_shop_id)
      AND (p_source IS NULL OR source = p_source)
      AND (p_date_from IS NULL OR created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR created_at::date <= p_date_to)
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET v_offset;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', p_page,
        'page_size', p_page_size,
        'total_pages', GREATEST(1, CEIL(v_total::numeric / p_page_size)::INT)
    );
END;
$$;

-- C.3 Журнал движений с фильтрацией
CREATE OR REPLACE FUNCTION household_chemicals.rpc_stock_movements_list(
    p_product_id INT DEFAULT NULL,
    p_warehouse_id INT DEFAULT NULL,
    p_movement_type TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset INT := (p_page - 1) * p_page_size;
    v_total INT;
    v_items JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM household_chemicals.v_stock_movements_full
    WHERE (p_product_id IS NULL OR product_id = p_product_id)
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_movement_type IS NULL OR movement_type = p_movement_type)
      AND (p_date_from IS NULL OR created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR created_at::date <= p_date_to);

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', id,
        'product_id', product_id,
        'product_name', product_name,
        'sku', sku,
        'warehouse_id', warehouse_id,
        'warehouse_name', warehouse_name,
        'quantity_change', quantity_change,
        'quantity_before', quantity_before,
        'quantity_after', quantity_after,
        'movement_type', movement_type,
        'movement_type_label', movement_type_label,
        'reference_type', reference_type,
        'reference_id', reference_id,
        'notes', notes,
        'created_by_name', created_by_name,
        'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_items
    FROM household_chemicals.v_stock_movements_full
    WHERE (p_product_id IS NULL OR product_id = p_product_id)
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_movement_type IS NULL OR movement_type = p_movement_type)
      AND (p_date_from IS NULL OR created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR created_at::date <= p_date_to)
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET v_offset;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', p_page,
        'page_size', p_page_size,
        'total_pages', GREATEST(1, CEIL(v_total::numeric / p_page_size)::INT)
    );
END;
$$;

-- C.4 Каталог товаров с остатками (JSON для быстрой загрузки)
CREATE OR REPLACE FUNCTION household_chemicals.rpc_product_catalog(
    p_category_id INT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_warehouse_id INT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset INT := (p_page - 1) * p_page_size;
    v_total INT;
    v_items JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM household_chemicals.products p
    WHERE p.is_active = true
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%');

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'product_id', p.id,
        'product_name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'unit', p.unit,
        'category_id', pc.id,
        'category_name', pc.name,
        'purchase_price', p.purchase_price,
        'min_stock', p.min_stock,
        'max_stock', p.max_stock,
        'stock', CASE WHEN p_warehouse_id IS NOT NULL THEN
            (SELECT sb.quantity FROM household_chemicals.stock_balances sb WHERE sb.product_id = p.id AND sb.warehouse_id = p_warehouse_id)
        ELSE
            (SELECT JSONB_OBJECT_AGG(w.name, sb.quantity)
             FROM household_chemicals.stock_balances sb
             JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
             WHERE sb.product_id = p.id)
        END,
        'total_stock', (SELECT COALESCE(SUM(sb.quantity), 0) FROM household_chemicals.stock_balances sb WHERE sb.product_id = p.id)
    ) ORDER BY pc.name, p.name), '[]'::jsonb) INTO v_items
    FROM household_chemicals.products p
    LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
    WHERE p.is_active = true
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
    ORDER BY pc.name, p.name
    LIMIT p_page_size OFFSET v_offset;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', p_page,
        'page_size', p_page_size,
        'total_pages', GREATEST(1, CEIL(v_total::numeric / p_page_size)::INT)
    );
END;
$$;

-- C.5 Детали заявки (со всеми товарами)
CREATE OR REPLACE FUNCTION household_chemicals.rpc_order_detail(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order JSONB;
    v_items JSONB;
    v_shipments JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'shop_id', o.shop_id,
        'shop_name', s.name,
        'warehouse_id', o.warehouse_id,
        'warehouse_name', w.name,
        'status', o.status,
        'source', o.source,
        'telegram_message_id', o.telegram_message_id,
        'notes', o.notes,
        'created_by_name', u.full_name,
        'submitted_at', o.submitted_at,
        'confirmed_at', o.confirmed_at,
        'shipped_at', o.shipped_at,
        'created_at', o.created_at
    ) INTO v_order
    FROM household_chemicals.orders o
    JOIN household_chemicals.shops s ON s.id = o.shop_id
    JOIN household_chemicals.warehouses w ON w.id = o.warehouse_id
    LEFT JOIN household_chemicals.users u ON u.id = o.created_by
    WHERE o.id = p_order_id;

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'product_name', p.name,
        'sku', p.sku,
        'unit', p.unit,
        'quantity_requested', oi.quantity_requested,
        'quantity_shipped', oi.quantity_shipped,
        'notes', oi.notes
    ) ORDER BY p.name), '[]'::jsonb) INTO v_items
    FROM household_chemicals.order_items oi
    JOIN household_chemicals.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', s.id,
        'shipment_number', s.shipment_number,
        'status', s.status,
        'shipped_at', s.shipped_at,
        'created_at', s.created_at
    ) ORDER BY s.created_at DESC), '[]'::jsonb) INTO v_shipments
    FROM household_chemicals.shipments s
    WHERE s.order_id = p_order_id;

    RETURN jsonb_build_object(
        'order', v_order,
        'items', v_items,
        'shipments', v_shipments
    );
END;
$$;

-- C.6 Получение списка категорий товаров (для выбора в боте)
CREATE OR REPLACE FUNCTION household_chemicals.rpc_categories_tree()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH RECURSIVE tree AS (
        SELECT id, name, parent_id, sort_order, 0 AS level, ARRAY[id] AS path
        FROM household_chemicals.product_categories
        WHERE parent_id IS NULL AND is_active = true

        UNION ALL

        SELECT c.id, c.name, c.parent_id, c.sort_order, t.level + 1, t.path || c.id
        FROM household_chemicals.product_categories c
        JOIN tree t ON t.id = c.parent_id
        WHERE c.is_active = true
    )
    SELECT JSONB_AGG(jsonb_build_object(
        'id', id,
        'name', name,
        'level', level
    ) ORDER BY path, sort_order) INTO v_result
    FROM tree;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================================
-- D. ФУНКЦИИ ОБРАБОТКИ TELEGRAM СООБЩЕНИЙ
-- ============================================================================

-- D.1 Регистрация или получение пользователя Telegram
CREATE OR REPLACE FUNCTION household_chemicals.telegram_get_or_create_user(
    p_user_id BIGINT,
    p_username TEXT DEFAULT NULL,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL
)
RETURNS household_chemicals.telegram_users
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user household_chemicals.telegram_users;
BEGIN
    INSERT INTO household_chemicals.telegram_users (user_id, username, first_name, last_name)
    VALUES (p_user_id, p_username, p_first_name, p_last_name)
    ON CONFLICT (user_id)
    DO UPDATE SET
        username = COALESCE(p_username, telegram_users.username),
        first_name = COALESCE(p_first_name, telegram_users.first_name),
        last_name = COALESCE(p_last_name, telegram_users.last_name),
        last_interaction_at = NOW()
    RETURNING * INTO v_user;

    RETURN v_user;
END;
$$;

-- D.2 Логирование сообщения
CREATE OR REPLACE FUNCTION household_chemicals.telegram_log_message(
    p_telegram_user_id INT,
    p_chat_id BIGINT,
    p_message_id INT,
    p_message_type TEXT,
    p_text_content TEXT DEFAULT NULL,
    p_parsed_command TEXT DEFAULT NULL,
    p_parsed_data JSONB DEFAULT NULL,
    p_processing_time_ms INT DEFAULT NULL,
    p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO household_chemicals.telegram_messages_log (
        telegram_user_id, chat_id, message_id, message_type,
        text_content, parsed_command, parsed_data,
        processing_time_ms, error
    ) VALUES (
        p_telegram_user_id, p_chat_id, p_message_id, p_message_type,
        p_text_content, p_parsed_command, p_parsed_data,
        p_processing_time_ms, p_error
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- D.3 Создание заявки из Telegram (основная функция)
CREATE OR REPLACE FUNCTION household_chemicals.telegram_create_order(
    p_telegram_user_id INT,
    p_shop_id INT,
    p_warehouse_id INT DEFAULT 1,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_notes TEXT DEFAULT NULL,
    p_telegram_message_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_household_user_id UUID;
    v_item RECORD;
    v_product household_chemicals.products%ROWTYPE;
    v_errors JSONB := '[]'::jsonb;
    v_created_items INT := 0;
BEGIN
    -- Получаем household_user_id из telegram_users
    SELECT household_user_id INTO v_household_user_id
    FROM household_chemicals.telegram_users
    WHERE id = p_telegram_user_id;

    -- Генерируем номер заявки
    v_order_number := household_chemicals.next_document_number('ORD');

    -- Создаём заявку
    INSERT INTO household_chemicals.orders (
        order_number, shop_id, warehouse_id, status, source,
        telegram_message_id, notes, created_by
    ) VALUES (
        v_order_number, p_shop_id, p_warehouse_id, 'submitted', 'telegram',
        p_telegram_message_id, p_notes, v_household_user_id
    ) RETURNING id INTO v_order_id;

    -- Обрабатываем товары
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id INT, quantity NUMERIC)
    LOOP
        -- Проверяем существование товара
        SELECT * INTO v_product FROM household_chemicals.products WHERE id = v_item.product_id AND is_active = true;

        IF NOT FOUND THEN
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_item.product_id,
                'error', 'Товар не найден или неактивен'
            );
            CONTINUE;
        END IF;

        IF v_item.quantity <= 0 THEN
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_item.product_id,
                'product_name', v_product.name,
                'error', 'Количество должно быть больше 0'
            );
            CONTINUE;
        END IF;

        -- Создаём строку заявки
        INSERT INTO household_chemicals.order_items (order_id, product_id, quantity_requested)
        VALUES (v_order_id, v_item.product_id, v_item.quantity);

        v_created_items := v_created_items + 1;
    END LOOP;

    -- Если ни одного товара не создано — отменяем заявку
    IF v_created_items = 0 THEN
        DELETE FROM household_chemicals.orders WHERE id = v_order_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Не удалось создать заявку: нет корректных товаров',
            'errors', v_errors
        );
    END IF;

    -- Логируем в аудит
    PERFORM household_chemicals.log_action(
        v_household_user_id, 'create', 'orders', v_order_id::TEXT,
        jsonb_build_object('source', 'telegram', 'shop_id', p_shop_id, 'items_count', v_created_items),
        'Заявка создана через Telegram: ' || v_order_number
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

-- D.4 Проверка статуса заявки по номеру
CREATE OR REPLACE FUNCTION household_chemicals.telegram_check_order_status(
    p_order_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'found', true,
        'order_number', o.order_number,
        'status', o.status,
        'shop_name', s.name,
        'warehouse_name', w.name,
        'items_count', (SELECT COUNT(*) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'total_requested', (SELECT COALESCE(SUM(oi.quantity_requested), 0) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'total_shipped', (SELECT COALESCE(SUM(oi.quantity_shipped), 0) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'created_at', o.created_at,
        'confirmed_at', o.confirmed_at,
        'shipped_at', o.shipped_at
    ) INTO v_result
    FROM household_chemicals.orders o
    JOIN household_chemicals.shops s ON s.id = o.shop_id
    JOIN household_chemicals.warehouses w ON w.id = o.warehouse_id
    WHERE o.order_number = p_order_number;

    IF v_result IS NULL THEN
        RETURN jsonb_build_object('found', false, 'error', 'Заявка не найдена');
    END IF;

    RETURN v_result;
END;
$$;

-- D.5 Получение каталога для Telegram (текстовое представление)
CREATE OR REPLACE FUNCTION household_chemicals.telegram_get_catalog_text(
    p_category_id INT DEFAULT NULL,
    p_warehouse_id INT DEFAULT 1,
    p_search TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result TEXT;
BEGIN
    WITH cat AS (
        SELECT
            p.id, p.name, p.unit,
            pc.name AS category_name,
            COALESCE(sb.quantity, 0) AS stock,
            p.min_stock
        FROM household_chemicals.products p
        LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
        LEFT JOIN household_chemicals.stock_balances sb ON sb.product_id = p.id AND sb.warehouse_id = p_warehouse_id
        WHERE p.is_active = true
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
        ORDER BY pc.name, p.name
    )
    SELECT STRING_AGG(
        cat.category_name || ':\n' ||
        STRING_AGG(
            '  • ' || cat.name || ' — ' || cat.stock || ' ' || cat.unit ||
            CASE WHEN cat.min_stock IS NOT NULL AND cat.stock <= cat.min_stock THEN ' ⚠️' ELSE '' END,
            E'\n'
        ),
        E'\n\n'
    ORDER BY cat.category_name)
    INTO v_result
    FROM cat
    GROUP BY cat.category_name;

    RETURN COALESCE(v_result, 'Каталог пуст');
END;
$$;


-- ============================================================================
-- E. ВЕБХУКИ И ИНТЕГРАЦИИ
-- ============================================================================

-- E.1 Добавление события в outbox
CREATE OR REPLACE FUNCTION household_chemicals.webhook_enqueue(
    p_event_type TEXT,
    p_payload JSONB,
    p_target_url TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO household_chemicals.webhook_outbox (event_type, payload, target_url, target_system)
    VALUES (p_event_type, p_payload, p_target_url, p_target_system)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- E.2 Логирование API-вызова
CREATE OR REPLACE FUNCTION household_chemicals.api_log(
    p_direction TEXT,
    p_method TEXT,
    p_endpoint TEXT,
    p_request_body JSONB DEFAULT NULL,
    p_response_status INT DEFAULT NULL,
    p_response_body JSONB DEFAULT NULL,
    p_source TEXT DEFAULT 'internal',
    p_duration_ms INT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO household_chemicals.api_integration_log (
        direction, method, endpoint, request_body,
        response_status, response_body, source,
        duration_ms, error_message, created_by
    ) VALUES (
        p_direction, p_method, p_endpoint, p_request_body,
        p_response_status, p_response_body, p_source,
        p_duration_ms, p_error_message, p_created_by
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- E.3 Автоматическое создание событий outbox при изменении статуса
-- (через триггер на orders)
CREATE OR REPLACE FUNCTION household_chemicals.trigger_order_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM household_chemicals.webhook_enqueue(
            'order.status_changed',
            jsonb_build_object(
                'order_id', NEW.id,
                'order_number', NEW.order_number,
                'old_status', OLD.status,
                'new_status', NEW.status,
                'shop_id', NEW.shop_id,
                'warehouse_id', NEW.warehouse_id,
                'timestamp', NOW()
            ),
            NULL, 'external'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_webhook ON household_chemicals.orders;
CREATE TRIGGER trg_order_webhook
    AFTER UPDATE OF status ON household_chemicals.orders
    FOR EACH ROW
    EXECUTE FUNCTION household_chemicals.trigger_order_webhook();


-- ============================================================================
-- F. RLS ПОЛИТИКИ НА НОВЫЕ ТАБЛИЦЫ
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'telegram_chats', 'telegram_users', 'telegram_pending_orders', 'telegram_messages_log',
        'api_integration_log', 'webhook_outbox', 'sync_status', 'document_sequences'
    ]
    LOOP
        EXECUTE format('ALTER TABLE household_chemicals.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE household_chemicals.%I FORCE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('DROP POLICY IF EXISTS service_role_all ON household_chemicals.%I;', tbl);
        EXECUTE format('CREATE POLICY service_role_all ON household_chemicals.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl);

        EXECUTE format('DROP POLICY IF EXISTS auth_read_all ON household_chemicals.%I;', tbl);
        EXECUTE format('CREATE POLICY auth_read_all ON household_chemicals.%I FOR SELECT TO authenticated USING (true);', tbl);

        EXECUTE format('DROP POLICY IF EXISTS auth_write_all ON household_chemicals.%I;', tbl);
        EXECUTE format(
            'CREATE POLICY auth_write_all ON household_chemicals.%I FOR INSERT TO authenticated WITH CHECK (household_chemicals.get_user_role() IN (''admin'', ''warehouse_operator''));',
            tbl
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- G. ДОПОЛНИТЕЛЬНЫЕ ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON household_chemicals.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_warehouse ON household_chemicals.orders(status, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON household_chemicals.receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON household_chemicals.shipments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON household_chemicals.stock_movements(movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created ON household_chemicals.audit_log(entity_type, entity_id, created_at DESC);
