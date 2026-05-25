-- ============================================================================
-- Миграция: Полноценный складской учёт (household_chemicals)
-- Бытовая химия, расходники, хозтовары, упаковка — полный цикл
-- Создано: 2026-05-22
-- ============================================================================

-- ============================================================================
-- 0. Удаляем существующие объекты схемы (чистый старт)
-- ============================================================================
DROP VIEW IF EXISTS household_chemicals.orders_with_details CASCADE;
DROP VIEW IF EXISTS household_chemicals.catalog CASCADE;
DROP TABLE IF EXISTS household_chemicals.shipments_log CASCADE;
DROP TABLE IF EXISTS household_chemicals.order_items CASCADE;
DROP TABLE IF EXISTS household_chemicals.orders CASCADE;
DROP TABLE IF EXISTS household_chemicals.users CASCADE;


-- ============================================================================
-- 1. СПРАВОЧНИКИ (Reference Data)
-- ============================================================================

-- 1.1 Категории товаров (иерархические)
CREATE TABLE IF NOT EXISTS household_chemicals.product_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INT REFERENCES household_chemicals.product_categories(id),
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_categories_parent ON household_chemicals.product_categories(parent_id);

-- 1.2 Поставщики
CREATE TABLE IF NOT EXISTS household_chemicals.suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Склады
CREATE TABLE IF NOT EXISTS household_chemicals.warehouses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('central', 'shop', 'transit')),
    address TEXT,
    contact_person TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Магазины (точки продаж)
CREATE TABLE IF NOT EXISTS household_chemicals.shops (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    warehouse_id INT REFERENCES household_chemicals.warehouses(id),
    poster_spot_id INT,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Номенклатура (товары)
CREATE TABLE IF NOT EXISTS household_chemicals.products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    barcode TEXT,
    category_id INT REFERENCES household_chemicals.product_categories(id),
    unit TEXT NOT NULL DEFAULT 'шт',
    purchase_price NUMERIC(12, 2),
    min_stock NUMERIC(12, 3),
    max_stock NUMERIC(12, 3),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category ON household_chemicals.products(category_id);
CREATE INDEX idx_products_sku ON household_chemicals.products(sku);
CREATE INDEX idx_products_barcode ON household_chemicals.products(barcode);

-- 1.6 Пользователи системы
CREATE TABLE IF NOT EXISTS household_chemicals.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id),
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'warehouse_operator', 'shop_manager', 'viewer')),
    warehouse_id INT REFERENCES household_chemicals.warehouses(id),
    phone TEXT,
    telegram_chat_id TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 2. ДОКУМЕНТЫ ПОСТУПЛЕНИЯ (Receiving)
-- ============================================================================

-- 2.1 Приходные накладные
CREATE TABLE IF NOT EXISTS household_chemicals.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT NOT NULL,
    supplier_id INT REFERENCES household_chemicals.suppliers(id),
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
    created_by UUID REFERENCES household_chemicals.users(id),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_warehouse ON household_chemicals.receipts(warehouse_id);
CREATE INDEX idx_receipts_supplier ON household_chemicals.receipts(supplier_id);
CREATE INDEX idx_receipts_status ON household_chemicals.receipts(status);

-- 2.2 Строки приходных накладных
CREATE TABLE IF NOT EXISTS household_chemicals.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES household_chemicals.receipts(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    price NUMERIC(12, 2),
    total NUMERIC(14, 2) GENERATED ALWAYS AS (COALESCE(quantity * price, 0)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipt_items_receipt ON household_chemicals.receipt_items(receipt_id);
CREATE INDEX idx_receipt_items_product ON household_chemicals.receipt_items(product_id);


-- ============================================================================
-- 3. ЗАЯВКИ ОТ МАГАЗИНОВ (Shop Orders)
-- ============================================================================

-- 3.1 Заявки
CREATE TABLE IF NOT EXISTS household_chemicals.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL,
    shop_id INT NOT NULL REFERENCES household_chemicals.shops(id),
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed', 'partially_shipped', 'shipped', 'cancelled')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('telegram', 'manual', 'api')),
    telegram_message_id TEXT,
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    confirmed_by UUID REFERENCES household_chemicals.users(id),
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_shop ON household_chemicals.orders(shop_id);
CREATE INDEX idx_orders_warehouse ON household_chemicals.orders(warehouse_id);
CREATE INDEX idx_orders_status ON household_chemicals.orders(status);
CREATE INDEX idx_orders_source ON household_chemicals.orders(source);
CREATE INDEX idx_orders_telegram ON household_chemicals.orders(telegram_message_id);

-- 3.2 Строки заявок
CREATE TABLE IF NOT EXISTS household_chemicals.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES household_chemicals.orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    quantity_requested NUMERIC(12, 3) NOT NULL CHECK (quantity_requested > 0),
    quantity_shipped NUMERIC(12, 3) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON household_chemicals.order_items(order_id);
CREATE INDEX idx_order_items_product ON household_chemicals.order_items(product_id);


-- ============================================================================
-- 4. ОТГРУЗКИ (Shipments)
-- ============================================================================

-- 4.1 Отгрузки/выдачи
CREATE TABLE IF NOT EXISTS household_chemicals.shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_number TEXT NOT NULL,
    order_id UUID REFERENCES household_chemicals.orders(id),
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    shop_id INT NOT NULL REFERENCES household_chemicals.shops(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'packed', 'shipped', 'delivered', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipments_order ON household_chemicals.shipments(order_id);
CREATE INDEX idx_shipments_warehouse ON household_chemicals.shipments(warehouse_id);
CREATE INDEX idx_shipments_shop ON household_chemicals.shipments(shop_id);

-- 4.2 Строки отгрузок
CREATE TABLE IF NOT EXISTS household_chemicals.shipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES household_chemicals.shipments(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES household_chemicals.order_items(id),
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipment_items_shipment ON household_chemicals.shipment_items(shipment_id);
CREATE INDEX idx_shipment_items_order_item ON household_chemicals.shipment_items(order_item_id);


-- ============================================================================
-- 5. ПЕРЕМЕЩЕНИЯ МЕЖДУ СКЛАДАМИ (Transfers)
-- ============================================================================

-- 5.1 Перемещения
CREATE TABLE IF NOT EXISTS household_chemicals.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_number TEXT NOT NULL,
    from_warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    to_warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'completed', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    confirmed_by UUID REFERENCES household_chemicals.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_transfers_from ON household_chemicals.transfers(from_warehouse_id);
CREATE INDEX idx_transfers_to ON household_chemicals.transfers(to_warehouse_id);

-- 5.2 Строки перемещений
CREATE TABLE IF NOT EXISTS household_chemicals.transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES household_chemicals.transfers(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfer_items_transfer ON household_chemicals.transfer_items(transfer_id);


-- ============================================================================
-- 6. СПИСАНИЕ (Write-offs)
-- ============================================================================

-- 6.1 Акты списания
CREATE TABLE IF NOT EXISTS household_chemicals.write_offs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    write_off_number TEXT NOT NULL,
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    reason TEXT NOT NULL CHECK (reason IN ('expired', 'damaged', 'lost', 'inventory_correction', 'other')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
    created_by UUID REFERENCES household_chemicals.users(id),
    confirmed_by UUID REFERENCES household_chemicals.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_write_offs_warehouse ON household_chemicals.write_offs(warehouse_id);

-- 6.2 Строки списания
CREATE TABLE IF NOT EXISTS household_chemicals.write_off_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    write_off_id UUID NOT NULL REFERENCES household_chemicals.write_offs(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    price NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_write_off_items_wo ON household_chemicals.write_off_items(write_off_id);


-- ============================================================================
-- 7. ИНВЕНТАРИЗАЦИЯ (Inventory)
-- ============================================================================

-- 7.1 Инвентаризации
CREATE TABLE IF NOT EXISTS household_chemicals.inventories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_number TEXT NOT NULL,
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    completed_by UUID REFERENCES household_chemicals.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_inventories_warehouse ON household_chemicals.inventories(warehouse_id);

-- 7.2 Строки инвентаризации
CREATE TABLE IF NOT EXISTS household_chemicals.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES household_chemicals.inventories(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    expected_quantity NUMERIC(12, 3) DEFAULT 0,
    actual_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    difference NUMERIC(12, 3) GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_items_inv ON household_chemicals.inventory_items(inventory_id);


-- ============================================================================
-- 8. ОСТАТКИ И ДВИЖЕНИЯ (Stock & Movements)
-- ============================================================================

-- 8.1 Текущие остатки (актуальная картина)
CREATE TABLE IF NOT EXISTS household_chemicals.stock_balances (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, warehouse_id)
);

CREATE INDEX idx_stock_balances_product ON household_chemicals.stock_balances(product_id);
CREATE INDEX idx_stock_balances_warehouse ON household_chemicals.stock_balances(warehouse_id);
CREATE INDEX idx_stock_balances_low ON household_chemicals.stock_balances(warehouse_id, quantity);

-- 8.2 Журнал движений (аудит всех изменений остатков)
CREATE TABLE IF NOT EXISTS household_chemicals.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id INT NOT NULL REFERENCES household_chemicals.products(id),
    warehouse_id INT NOT NULL REFERENCES household_chemicals.warehouses(id),
    quantity_change NUMERIC(12, 3) NOT NULL,
    quantity_before NUMERIC(12, 3),
    quantity_after NUMERIC(12, 3),
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'receipt', 'shipment', 'transfer_out', 'transfer_in',
        'write_off', 'inventory_correction', 'initial'
    )),
    reference_type TEXT,
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON household_chemicals.stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse ON household_chemicals.stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_created ON household_chemicals.stock_movements(created_at);
CREATE INDEX idx_stock_movements_ref ON household_chemicals.stock_movements(reference_type, reference_id);


-- ============================================================================
-- 8а. АУДИТ — ТОТАЛЬНОЕ ЛОГИРОВНИЕ ВСЕХ ДЕЙСТВИЙ
-- ============================================================================

-- audit_log: каждая строка = одно действие пользователя
CREATE TABLE IF NOT EXISTS household_chemicals.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES household_chemicals.users(id),
    user_name TEXT,
    action TEXT NOT NULL CHECK (action IN (
        'create', 'update', 'delete', 'confirm', 'cancel',
        'complete', 'submit', 'ship', 'deliver',
        'login', 'logout', 'export', 'print',
        'set_initial_stock', 'inventory_correction', 'other'
    )),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    changes JSONB,
    summary TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON household_chemicals.audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON household_chemicals.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_action ON household_chemicals.audit_log(action);
CREATE INDEX idx_audit_log_created ON household_chemicals.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_lookup ON household_chemicals.audit_log(user_id, created_at DESC);

-- Функция: ручное логирование
CREATE OR REPLACE FUNCTION household_chemicals.log_action(
    p_user_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_changes JSONB DEFAULT NULL,
    p_summary TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
    v_user_name TEXT;
BEGIN
    SELECT full_name INTO v_user_name FROM household_chemicals.users WHERE id = p_user_id;

    INSERT INTO household_chemicals.audit_log (
        user_id, user_name, action, entity_type, entity_id,
        changes, summary, ip_address, user_agent
    ) VALUES (
        p_user_id, v_user_name, p_action, p_entity_type, p_entity_id,
        p_changes, p_summary, p_ip_address, p_user_agent
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ТРИГГЕРНАЯ ФУНКЦИЯ: автоаудит INSERT/UPDATE/DELETE
-- Записывает старые и новые значения только изменившихся колонок
CREATE OR REPLACE FUNCTION household_chemicals.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action TEXT;
    v_changes JSONB := '{}'::jsonb;
    v_entity_id TEXT;
    v_key TEXT;
    v_old_json JSONB;
    v_new_json JSONB;
    v_old_val TEXT;
    v_new_val TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_entity_id := COALESCE(NEW.id::TEXT, random()::TEXT);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_entity_id := COALESCE(NEW.id::TEXT, random()::TEXT);

        v_old_json := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new_json := to_jsonb(NEW) - 'created_at' - 'updated_at';

        FOR v_key IN SELECT key FROM jsonb_each_text(v_old_json)
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
        v_action := 'delete';
        v_entity_id := COALESCE(OLD.id::TEXT, random()::TEXT);
        v_changes := jsonb_build_object('deleted_record', to_jsonb(OLD));
        RETURN OLD;
    END IF;

    INSERT INTO household_chemicals.audit_log (
        action, entity_type, entity_id, changes
    ) VALUES (
        v_action, TG_TABLE_NAME, v_entity_id,
        CASE WHEN v_changes = '{}'::jsonb THEN NULL ELSE v_changes END
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Функция логирования подтверждений/отмен
CREATE OR REPLACE FUNCTION household_chemicals.audit_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action TEXT;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status IN ('confirmed', 'shipped', 'completed') THEN
            v_action := 'confirm';
        ELSIF NEW.status = 'cancelled' THEN
            v_action := 'cancel';
        ELSE
            v_action := 'update';
        END IF;

        INSERT INTO household_chemicals.audit_log (
            action, entity_type, entity_id,
            changes, summary
        ) VALUES (
            v_action, TG_TABLE_NAME, NEW.id::TEXT,
            jsonb_build_object(
                'status', jsonb_build_object('old', OLD.status, 'new', NEW.status)
            ),
            TG_TABLE_NAME || ' ' || NEW.id || ': ' || OLD.status || ' -> ' || NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Устанавливаем триггеры на ключевые таблицы
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['products', 'suppliers', 'warehouses', 'shops', 'users',
                               'receipts', 'receipt_items',
                               'orders', 'order_items',
                               'shipments', 'shipment_items',
                               'transfers', 'transfer_items',
                               'write_offs', 'write_off_items',
                               'inventories', 'inventory_items',
                               'stock_balances', 'stock_movements']
    LOOP
        -- Триггер на изменения данных
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON household_chemicals.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_%I
             AFTER INSERT OR UPDATE OR DELETE ON household_chemicals.%I
             FOR EACH ROW EXECUTE FUNCTION household_chemicals.audit_trigger_func();',
            tbl, tbl
        );

        -- Триггер на смену статуса (для документов с полем status)
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_status_%I ON household_chemicals.%I;', tbl, tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_audit_status_%I
                 AFTER UPDATE OF status ON household_chemicals.%I
                 FOR EACH ROW EXECUTE FUNCTION household_chemicals.audit_status_change();',
                tbl, tbl
            );
        EXCEPTION WHEN undefined_column THEN
            -- Таблица без поля status — пропускаем
        END;
    END LOOP;
END;
$$;


-- ============================================================================
-- 9. ФУНКЦИИ И ТРИГГЕРЫ (Business Logic)
-- ============================================================================

-- 9.1 Функция обновления остатков
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
    v_current NUMERIC(12, 3);
    v_new NUMERIC(12, 3);
BEGIN
    -- Получаем текущий остаток или 0, если записи нет
    SELECT quantity INTO v_current
    FROM household_chemicals.stock_balances
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

    v_current := COALESCE(v_current, 0);
    v_new := v_current + COALESCE(p_quantity_change, 0);

    -- Вставка или обновление остатка
    INSERT INTO household_chemicals.stock_balances (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, v_new, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = v_new, updated_at = NOW();

    -- Запись в журнал движений
    INSERT INTO household_chemicals.stock_movements (
        product_id, warehouse_id, quantity_change,
        quantity_before, quantity_after,
        movement_type, reference_type, reference_id, notes, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_quantity_change,
        v_current, v_new,
        p_movement_type, p_reference_type, p_reference_id, p_notes, p_created_by
    );

    RETURN v_new;
END;
$$;

-- 9.2 Функция: подтверждение прихода (оприходование)
CREATE OR REPLACE FUNCTION household_chemicals.confirm_receipt(p_receipt_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
BEGIN
    -- Проверяем статус
    IF (SELECT status FROM household_chemicals.receipts WHERE id = p_receipt_id) != 'draft' THEN
        RAISE EXCEPTION 'Receipt already confirmed or cancelled';
    END IF;

    -- Проводим каждую строку
    FOR r IN
        SELECT ri.product_id, ri.quantity, r.warehouse_id
        FROM household_chemicals.receipt_items ri
        JOIN household_chemicals.receipts r ON r.id = ri.receipt_id
        WHERE ri.receipt_id = p_receipt_id
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            r.product_id, r.warehouse_id, r.quantity,
            'receipt', 'receipt', p_receipt_id,
            'Приход по накладной', p_user_id
        );
    END LOOP;

    -- Меняем статус
    UPDATE household_chemicals.receipts
    SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
    WHERE id = p_receipt_id;
END;
$$;

-- 9.3 Функция: отгрузка по заявке
CREATE OR REPLACE FUNCTION household_chemicals.ship_order(p_order_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_shipment_id UUID;
    v_shipment_number TEXT;
BEGIN
    SELECT * INTO v_order FROM household_chemicals.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Генерируем номер отгрузки
    v_shipment_number := 'SH-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));

    -- Создаём отгрузку
    INSERT INTO household_chemicals.shipments (shipment_number, order_id, warehouse_id, shop_id, status, created_by)
    VALUES (v_shipment_number, p_order_id, v_order.warehouse_id, v_order.shop_id, 'shipped', p_user_id)
    RETURNING id INTO v_shipment_id;

    -- Проводим товары
    INSERT INTO household_chemicals.shipment_items (shipment_id, order_item_id, product_id, quantity)
    SELECT v_shipment_id, oi.id, oi.product_id, oi.quantity_shipped
    FROM household_chemicals.order_items oi
    WHERE oi.order_id = p_order_id AND oi.quantity_shipped > 0;

    -- Списываем со склада
    PERFORM household_chemicals.update_stock_balance(
        si.product_id, v_order.warehouse_id, -si.quantity,
        'shipment', 'shipment', v_shipment_id,
        'Отгрузка по заявке', p_user_id
    )
    FROM household_chemicals.shipment_items si
    WHERE si.shipment_id = v_shipment_id;

    -- Обновляем статус заявки
    UPDATE household_chemicals.orders
    SET status = 'shipped', shipped_at = NOW(), updated_at = NOW()
    WHERE id = p_order_id;

    -- Обновляем статус отгрузки
    UPDATE household_chemicals.shipments
    SET status = 'shipped', shipped_at = NOW()
    WHERE id = v_shipment_id;

    RETURN v_shipment_id;
END;
$$;

-- 9.4 Функция: подтверждение перемещения
CREATE OR REPLACE FUNCTION household_chemicals.confirm_transfer(p_transfer_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
BEGIN
    SELECT * INTO v_transfer FROM household_chemicals.transfers WHERE id = p_transfer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.status != 'draft' THEN RAISE EXCEPTION 'Transfer already processed'; END IF;

    -- Списываем с источника
    PERFORM household_chemicals.update_stock_balance(
        ti.product_id, v_transfer.from_warehouse_id, -ti.quantity,
        'transfer_out', 'transfer', p_transfer_id,
        'Перемещение: списание с источника', p_user_id
    )
    FROM household_chemicals.transfer_items ti
    WHERE ti.transfer_id = p_transfer_id;

    -- Оприходуем на получателе
    PERFORM household_chemicals.update_stock_balance(
        ti.product_id, v_transfer.to_warehouse_id, ti.quantity,
        'transfer_in', 'transfer', p_transfer_id,
        'Перемещение: оприходование на получателе', p_user_id
    )
    FROM household_chemicals.transfer_items ti
    WHERE ti.transfer_id = p_transfer_id;

    UPDATE household_chemicals.transfers
    SET status = 'completed', confirmed_by = p_user_id, completed_at = NOW()
    WHERE id = p_transfer_id;
END;
$$;

-- 9.5 Функция: подтверждение списания
CREATE OR REPLACE FUNCTION household_chemicals.confirm_write_off(p_write_off_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_write_off RECORD;
BEGIN
    SELECT * INTO v_write_off FROM household_chemicals.write_offs WHERE id = p_write_off_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Write-off not found'; END IF;
    IF v_write_off.status != 'draft' THEN RAISE EXCEPTION 'Write-off already processed'; END IF;

    PERFORM household_chemicals.update_stock_balance(
        wi.product_id, v_write_off.warehouse_id, -wi.quantity,
        'write_off', 'write_off', p_write_off_id,
        'Списание: ' || v_write_off.reason, p_user_id
    )
    FROM household_chemicals.write_off_items wi
    WHERE wi.write_off_id = p_write_off_id;

    UPDATE household_chemicals.write_offs
    SET status = 'confirmed', confirmed_by = p_user_id, confirmed_at = NOW()
    WHERE id = p_write_off_id;
END;
$$;

-- 9.6 Функция: завершение инвентаризации с коррекцией остатков
CREATE OR REPLACE FUNCTION household_chemicals.complete_inventory(p_inventory_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory RECORD;
    v_diff NUMERIC(12, 3);
BEGIN
    SELECT * INTO v_inventory FROM household_chemicals.inventories WHERE id = p_inventory_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory not found'; END IF;
    IF v_inventory.status != 'in_progress' THEN RAISE EXCEPTION 'Invalid inventory status'; END IF;

    FOR v_diff IN
        SELECT ii.product_id, (ii.actual_quantity - ii.expected_quantity) AS diff
        FROM household_chemicals.inventory_items ii
        WHERE ii.inventory_id = p_inventory_id AND ii.actual_quantity != ii.expected_quantity
    LOOP
        PERFORM household_chemicals.update_stock_balance(
            v_diff.product_id, v_inventory.warehouse_id, v_diff,
            'inventory_correction', 'inventory', p_inventory_id,
            'Коррекция по инвентаризации', p_user_id
        );
    END LOOP;

    UPDATE household_chemicals.inventories
    SET status = 'completed', completed_by = p_user_id, completed_at = NOW()
    WHERE id = p_inventory_id;
END;
$$;

-- 9.7 Функция установки начальных остатков
CREATE OR REPLACE FUNCTION household_chemicals.set_initial_stock(
    p_product_id INT,
    p_warehouse_id INT,
    p_quantity NUMERIC(12, 3),
    p_user_id UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM household_chemicals.update_stock_balance(
        p_product_id, p_warehouse_id, p_quantity,
        'initial', NULL, NULL,
        'Начальный остаток', p_user_id
    );
END;
$$;


-- ============================================================================
-- 10. ПРЕДСТАВЛЕНИЯ (Views) для дашборда и аналитики
-- ============================================================================

-- 10.1 Сводка остатков с информацией о товаре
CREATE OR REPLACE VIEW household_chemicals.v_stock_summary AS
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

-- 10.2 Критический минимум (товары которые нужно заказать)
CREATE OR REPLACE VIEW household_chemicals.v_critical_stock AS
SELECT *
FROM household_chemicals.v_stock_summary
WHERE stock_status = 'critical'
ORDER BY warehouse_name, category_name, product_name;

-- 10.3 Заявки с деталями
CREATE OR REPLACE VIEW household_chemicals.v_orders_with_details AS
SELECT
    o.id,
    o.order_number,
    o.shop_id,
    s.name AS shop_name,
    o.warehouse_id,
    w.name AS warehouse_name,
    o.status,
    o.source,
    o.notes,
    o.created_by,
    u.full_name AS created_by_name,
    o.submitted_at,
    o.confirmed_at,
    o.shipped_at,
    o.created_at,
    COUNT(oi.id) AS items_count,
    SUM(oi.quantity_requested) AS total_requested,
    SUM(oi.quantity_shipped) AS total_shipped
FROM household_chemicals.orders o
JOIN household_chemicals.shops s ON s.id = o.shop_id
JOIN household_chemicals.warehouses w ON w.id = o.warehouse_id
LEFT JOIN household_chemicals.users u ON u.id = o.created_by
LEFT JOIN household_chemicals.order_items oi ON oi.order_id = o.id
GROUP BY o.id, s.name, w.name, u.full_name;

-- 10.4 Движения товара за период (для отчётов)
CREATE OR REPLACE VIEW household_chemicals.v_stock_movements_full AS
SELECT
    sm.id,
    sm.product_id,
    p.name AS product_name,
    p.sku,
    p.unit,
    sm.warehouse_id,
    w.name AS warehouse_name,
    sm.quantity_change,
    sm.quantity_before,
    sm.quantity_after,
    sm.movement_type,
    CASE sm.movement_type
        WHEN 'receipt' THEN 'Приход'
        WHEN 'shipment' THEN 'Отгрузка'
        WHEN 'transfer_out' THEN 'Перемещение (списание)'
        WHEN 'transfer_in' THEN 'Перемещение (оприходование)'
        WHEN 'write_off' THEN 'Списание'
        WHEN 'inventory_correction' THEN 'Коррекция (инвентаризация)'
        WHEN 'initial' THEN 'Начальный остаток'
    END AS movement_type_label,
    sm.reference_type,
    sm.reference_id,
    sm.notes,
    u.full_name AS created_by_name,
    sm.created_at
FROM household_chemicals.stock_movements sm
JOIN household_chemicals.products p ON p.id = sm.product_id
JOIN household_chemicals.warehouses w ON w.id = sm.warehouse_id
LEFT JOIN household_chemicals.users u ON u.id = sm.created_by;

-- 10.5 Дашборд: статистика по складу
CREATE OR REPLACE VIEW household_chemicals.v_dashboard_stats AS
SELECT
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0) AS products_in_stock,
    COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity <= 0 OR sb.quantity IS NULL) AS products_out_of_stock,
    COUNT(DISTINCT sb.product_id) FILTER (
        WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock
    ) AS critical_items,
    COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('submitted', 'confirmed')) AS pending_orders,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'shipped') AS shipments_today
FROM household_chemicals.warehouses w
LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
LEFT JOIN household_chemicals.orders o ON o.warehouse_id = w.id AND o.created_at::date = CURRENT_DATE
LEFT JOIN household_chemicals.shipments s ON s.warehouse_id = w.id AND s.created_at::date = CURRENT_DATE
GROUP BY w.id, w.name;

-- 10.6 Полный каталог товаров с остатками по складам
CREATE OR REPLACE VIEW household_chemicals.v_product_catalog AS
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.barcode,
    p.unit,
    p.purchase_price,
    p.min_stock,
    p.max_stock,
    pc.id AS category_id,
    pc.name AS category_name,
    pc.parent_id AS category_parent_id,
    (SELECT COALESCE(JSONB_OBJECT_AGG(
        w.name,
        JSONB_BUILD_OBJECT('quantity', sb.quantity, 'warehouse_id', w.id)
    ), '{}'::jsonb)
     FROM household_chemicals.stock_balances sb
     JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
     WHERE sb.product_id = p.id
    ) AS stock_by_warehouse,
    (SELECT COALESCE(SUM(sb.quantity), 0)
     FROM household_chemicals.stock_balances sb
     WHERE sb.product_id = p.id
    ) AS total_stock
FROM household_chemicals.products p
LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
WHERE p.is_active = true;


-- ============================================================================
-- 11. RLSPOLICIES (Row Level Security)
-- ============================================================================

-- Вспомогательная функция: можно ли редактировать запись
-- (service_role bypasses RLS, authenticated users проверяются)
-- Для всех таблиц:
-- - service_role имеет полный доступ
-- - authenticated читает всё
-- - запись/изменение — по роли

-- Функция проверки роли пользователя
CREATE OR REPLACE FUNCTION household_chemicals.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (SELECT role FROM household_chemicals.users WHERE auth_user_id = auth.uid() LIMIT 1),
        'viewer'
    );
$$;

-- Применяем RLS ко всем таблицам
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'product_categories', 'products', 'suppliers', 'warehouses', 'shops', 'users',
            'receipts', 'receipt_items',
            'orders', 'order_items',
            'shipments', 'shipment_items',
            'transfers', 'transfer_items',
            'write_offs', 'write_off_items',
            'inventories', 'inventory_items',
            'stock_balances', 'stock_movements',
            'audit_log'
        ])
    LOOP
        EXECUTE format('ALTER TABLE household_chemicals.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE household_chemicals.%I FORCE ROW LEVEL SECURITY;', tbl);

        -- service_role — полный доступ
        EXECUTE format('DROP POLICY IF EXISTS service_role_all ON household_chemicals.%I;', tbl);
        EXECUTE format('CREATE POLICY service_role_all ON household_chemicals.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl);

        -- authenticated — чтение всего
        EXECUTE format('DROP POLICY IF EXISTS auth_read_all ON household_chemicals.%I;', tbl);
        EXECUTE format('CREATE POLICY auth_read_all ON household_chemicals.%I FOR SELECT TO authenticated USING (true);', tbl);

        -- Изменение — только admin и warehouse_operator
        EXECUTE format('DROP POLICY IF EXISTS auth_write_all ON household_chemicals.%I;', tbl);
        EXECUTE format(
            'CREATE POLICY auth_write_all ON household_chemicals.%I FOR INSERT TO authenticated WITH CHECK (household_chemicals.get_user_role() IN (''admin'', ''warehouse_operator''));',
            tbl
        );
        EXECUTE format(
            'CREATE POLICY auth_update_all ON household_chemicals.%I FOR UPDATE TO authenticated USING (household_chemicals.get_user_role() IN (''admin'', ''warehouse_operator'')) WITH CHECK (household_chemicals.get_user_role() IN (''admin'', ''warehouse_operator''));',
            tbl
        );
    END LOOP;
END;
$$;

-- Для orders добавлена политика: shop_manager может создавать заявки
DROP POLICY IF EXISTS auth_write_all ON household_chemicals.orders;
CREATE POLICY auth_write_all ON household_chemicals.orders
    FOR INSERT TO authenticated
    WITH CHECK (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'));

DROP POLICY IF EXISTS auth_update_all ON household_chemicals.orders;
CREATE POLICY auth_update_all ON household_chemicals.orders
    FOR UPDATE TO authenticated
    USING (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'))
    WITH CHECK (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'));

-- Для order_items
DROP POLICY IF EXISTS auth_write_all ON household_chemicals.order_items;
CREATE POLICY auth_write_all ON household_chemicals.order_items
    FOR INSERT TO authenticated
    WITH CHECK (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'));

DROP POLICY IF EXISTS auth_update_all ON household_chemicals.order_items;
CREATE POLICY auth_update_all ON household_chemicals.order_items
    FOR UPDATE TO authenticated
    USING (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'))
    WITH CHECK (household_chemicals.get_user_role() IN ('admin', 'warehouse_operator', 'shop_manager'));


-- ============================================================================
-- 12. ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ (композитные)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_movements_lookup
    ON household_chemicals.stock_movements(product_id, warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_lookup
    ON household_chemicals.orders(warehouse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_lookup
    ON household_chemicals.receipts(warehouse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_lookup
    ON household_chemicals.shipments(warehouse_id, status, created_at DESC);


-- ============================================================================
-- 13. СИДЫ (начальные данные)
-- ============================================================================

-- Категории товаров (бытовая химия, расходники, упаковка и т.д.)
INSERT INTO household_chemicals.product_categories (name, description, sort_order) VALUES
    ('Бытовая химия', 'Моющие средства, чистящие средства, порошки', 1),
    ('Упаковка', 'Пакеты, коробки, скотч, стрейч-пленка', 2),
    ('Расходники для пекарни', 'Формы, пергамент, рукава и т.д.', 3),
    ('Одноразовая посуда', 'Стаканы, тарелки, приборы', 4),
    ('Кухонный инвентарь', 'Губки, салфетки, полотенца, перчатки', 5),
    ('Сангигиена', 'Мыло, антисептики, туалетная бумага', 6),
    ('Спецодежда', 'Фартуки, колпаки, бахилы', 7),
    ('Канцелярия', 'Ручки, бумага, стикеры', 8),
    ('Зоотовары', NULL, 9),
    ('Прочее', 'Прочие товары', 99);

-- Создаём склад default
INSERT INTO household_chemicals.warehouses (id, name, type) VALUES
    (1, 'Центральный склад (Гравітон)', 'central'),
    (2, 'Гравітон (магазин)', 'shop'),
    (3, 'Кварц', 'shop'),
    (4, 'Шкільна', 'shop'),
    (5, 'Герцена', 'shop'),
    (6, 'Проспект', 'shop'),
    (7, 'Комарова', 'shop'),
    (8, 'Героїв Майдану', 'shop'),
    (9, 'Клуб', 'shop'),
    (10, 'Ентузіастів', 'shop')
ON CONFLICT (id) DO NOTHING;

-- Связываем магазины со складами (warehouse_id = storage_id из Poster)
INSERT INTO household_chemicals.shops (name, warehouse_id, poster_spot_id) VALUES
    ('Гравітон', 2, 1),
    ('Кварц', 3, 2),
    ('Шкільна', 4, 3),
    ('Герцена', 5, 4),
    ('Проспект', 6, 5),
    ('Комарова', 7, 6),
    ('Героїв Майдану', 8, 7),
    ('Клуб', 9, 18),
    ('Ентузіастів', 10, 23)
ON CONFLICT (name) DO NOTHING;
