-- ============================================================================
-- Миграция #3: Синхронизация справочников магазинов и складов из Poster
-- Создано: 2026-05-22
-- ============================================================================

-- Добавляем колонку poster_storage_id в таблицу складов
ALTER TABLE household_chemicals.warehouses
  ADD COLUMN IF NOT EXISTS poster_storage_id INT UNIQUE;

-- Удаляем старые сиды и все зависимые данные (их пока нет — проект свежий)
TRUNCATE TABLE household_chemicals.shops CASCADE;
TRUNCATE TABLE household_chemicals.warehouses CASCADE;

-- Сбрасываем последовательности
ALTER SEQUENCE household_chemicals.warehouses_id_seq RESTART WITH 1;
ALTER SEQUENCE household_chemicals.shops_id_seq RESTART WITH 1;

-- ============================================================================
-- СКЛАДЫ (из Poster storage.getStorages)
-- Используем poster_storage_id = оригинальный ID из Poster
-- ============================================================================
INSERT INTO household_chemicals.warehouses (name, type, poster_storage_id) VALUES
    -- Магазины (shop-тип склады)
    ('Магазин "Гравітон"',           'shop',    2),
    ('Магазин "Кварц"',              'shop',    3),
    ('Магазин "Героїв Майдану"',     'shop',    5),
    ('Магазин "Руська"',             'shop',    6),
    ('Магазин "Проспект"',           'shop',    7),
    ('Магазин "Шкільна"',            'shop',    8),
    ('Магазин "Герцена"',            'shop',    9),
    ('Магазин "Ентузіастів"',        'shop',    20),
    ('Магазин "Комарова 26 круг"',   'shop',    21),
    ('Магазин "Садгора"',            'shop',    25),
    ('Магазин "Сторожинець"',        'shop',    26),
    ('Магазин "Черемош"',            'shop',    30),
    ('Магазин "Київ"',               'shop',    33),
    ('Магазин "Садова"',             'shop',    34),
    ('Магазин "Рівненська"',         'shop',    36),
    ('Магазин "Хотинська"',          'shop',    39),
    ('Магазин "Мікрорайон"',         'shop',    43),
    ('Магазин "Білоруська"',         'shop',    44),
    ('Магазин "Бульвар"',            'shop',    45),
    ('Магазин "Квартал"',            'shop',    47),
    ('Магазин "Клуб"',               'shop',    52),
    ('Магазин "Компас"',              'shop',    53),
    ('Магазин "Роша"',               'shop',    55),
    ('Магазин "Берегомет"',          'shop',    57),
    -- Центральные склады (производство, сырьё, расходники)
    ('ЦЕХ "2 поверх"',               'central', 13),
    ('ЦЕХ "Піцерія ГРАВІТОН"',      'central', 15),
    ('ЦЕХ "Бульвар-Автовокзал"',     'central', 22),
    ('ЦЕХ НІЧНА ЗМІНА "САДОВА"',    'central', 35),
    ('ЦЕХ "Флорида"',                'central', 41),
    ('ЦЕХ "Піцерія МІКРОРАЙОН"',    'central', 49),
    ('Склад витратних матеріалів',   'central', 37),
    ('Склад "Крафтова пекарня"',     'central', 42),
    ('Склад сировини "Трембіта"',    'central', 46),
    ('Склад "Кондитерка"',           'central', 48),
    ('Склад № 2',                    'central', 50),
    ('Склад "Запаси Анатолійовича"', 'central', 51),
    ('Списання ХЛІБА',               'central', 54),
    ('Замовник',                     'central', 56)
ON CONFLICT (poster_storage_id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type;

-- Фиксим последовательность
SELECT setval('household_chemicals.warehouses_id_seq', COALESCE((SELECT MAX(id) FROM household_chemicals.warehouses), 1));

-- ============================================================================
-- МАГАЗИНЫ (из Poster access.getSpots)
-- Привязываем к складу по poster_storage_id → poster_spot_id
-- ============================================================================
INSERT INTO household_chemicals.shops (name, warehouse_id, poster_spot_id)
VALUES
    ('Гравітон',        (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 2),  5),
    ('Кварц',           (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 3),  1),
    ('Героїв Майдану',  (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 5),  8),
    ('Руська',          (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 6),  6),
    ('Проспект',        (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 7),  4),
    ('Шкільна',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 8),  2),
    ('Герцена',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 9),  3),
    ('Ентузіастів',     (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 20), 9),
    ('Комарова 26 круг',(SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 21), 7),
    ('Садгора',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 25), 10),
    ('Сторожинець',     (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 26), 11),
    ('Черемош',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 30), 12),
    ('Київ',            (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 33), 13),
    ('Садова',          (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 34), 15),
    ('Рівненська',      (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 36), 14),
    ('Хотинська',       (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 39), 16),
    ('Мікрорайон',      (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 43), 19),
    ('Білоруська',      (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 44), 20),
    ('Бульвар',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 45), 21),
    ('Квартал',         (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 47), 22),
    ('Клуб',            (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 52), 18),
    ('Компас',          (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 53), 17),
    ('Роша',            (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 55), 23),
    ('Берегомет',       (SELECT id FROM household_chemicals.warehouses WHERE poster_storage_id = 57), 24)
ON CONFLICT (name) DO UPDATE SET
    warehouse_id = EXCLUDED.warehouse_id,
    poster_spot_id = EXCLUDED.poster_spot_id;

-- Фиксим последовательность
SELECT setval('household_chemicals.shops_id_seq', COALESCE((SELECT MAX(id) FROM household_chemicals.shops), 1));

-- ============================================================================
-- RPC: статистика по магазинам за период
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_shops_with_stats(p_days INT DEFAULT 14)
RETURNS TABLE (
    id INT,
    name TEXT,
    poster_spot_id INT,
    warehouse_id INT,
    warehouse_name TEXT,
    products_in_stock BIGINT,
    critical_items BIGINT,
    total_stock_value NUMERIC,
    receipts_count BIGINT,
    shipments_count BIGINT,
    transfers_in_count BIGINT,
    transfers_out_count BIGINT,
    write_offs_count BIGINT,
    orders_count BIGINT,
    last_receipt_date TIMESTAMPTZ,
    last_shipment_date TIMESTAMPTZ
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH period AS (
        SELECT NOW() - (p_days || ' days')::INTERVAL AS since
    )
    SELECT
        s.id,
        s.name,
        s.poster_spot_id,
        w.id,
        w.name,
        COUNT(DISTINCT sb.product_id) FILTER (WHERE COALESCE(sb.quantity, 0) > 0)::BIGINT,
        COUNT(DISTINCT sb.product_id) FILTER (
            WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock
        )::BIGINT,
        COALESCE(SUM(sb.quantity * p.purchase_price), 0),
        COUNT(DISTINCT r.id) FILTER (WHERE r.created_at >= (SELECT since FROM period))::BIGINT,
        COUNT(DISTINCT sh.id) FILTER (WHERE sh.created_at >= (SELECT since FROM period))::BIGINT,
        COUNT(DISTINCT t.id) FILTER (WHERE t.to_warehouse_id = w.id AND t.created_at >= (SELECT since FROM period))::BIGINT,
        COUNT(DISTINCT t.id) FILTER (WHERE t.from_warehouse_id = w.id AND t.created_at >= (SELECT since FROM period))::BIGINT,
        COUNT(DISTINCT wo.id) FILTER (WHERE wo.created_at >= (SELECT since FROM period))::BIGINT,
        COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= (SELECT since FROM period))::BIGINT,
        MAX(r.created_at) FILTER (WHERE r.created_at >= (SELECT since FROM period)),
        MAX(sh.created_at) FILTER (WHERE sh.created_at >= (SELECT since FROM period))
    FROM household_chemicals.shops s
    JOIN household_chemicals.warehouses w ON w.id = s.warehouse_id
    LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
    LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
    LEFT JOIN household_chemicals.receipts r ON r.warehouse_id = w.id
    LEFT JOIN household_chemicals.shipments sh ON sh.warehouse_id = w.id
    LEFT JOIN household_chemicals.transfers t ON t.from_warehouse_id = w.id OR t.to_warehouse_id = w.id
    LEFT JOIN household_chemicals.write_offs wo ON wo.warehouse_id = w.id
    LEFT JOIN household_chemicals.orders o ON o.warehouse_id = w.id
    GROUP BY s.id, s.name, s.poster_spot_id, w.id, w.name
    ORDER BY s.name;
END;
$$;
