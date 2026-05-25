-- Migration #14: Довідник цехів та складів з прив'язкою до магазинів
-- warehouse_type: shop - магазин, workshop - цех, storage - склад, other - інше
-- parent_shop_id: до якого магазину прив'язаний цех/склад (NULL якщо не прив'язаний)

ALTER TABLE household_chemicals.warehouses
  ADD COLUMN IF NOT EXISTS warehouse_type TEXT CHECK (warehouse_type IN ('shop', 'workshop', 'storage', 'other')),
  ADD COLUMN IF NOT EXISTS parent_shop_id INT REFERENCES household_chemicals.shops(id);

CREATE INDEX IF NOT EXISTS idx_warehouses_type ON household_chemicals.warehouses(warehouse_type);
CREATE INDEX IF NOT EXISTS idx_warehouses_parent_shop ON household_chemicals.warehouses(parent_shop_id);

-- Автоматично визначити тип складу за назвою
UPDATE household_chemicals.warehouses SET warehouse_type = 'shop'
WHERE warehouse_type IS NULL AND name ILIKE 'Магазин%';

UPDATE household_chemicals.warehouses SET warehouse_type = 'workshop'
WHERE warehouse_type IS NULL AND name ILIKE 'ЦЕХ%';

UPDATE household_chemicals.warehouses SET warehouse_type = 'storage'
WHERE warehouse_type IS NULL AND (name ILIKE 'Склад%' OR name ILIKE 'Списання%');

UPDATE household_chemicals.warehouses SET warehouse_type = 'other'
WHERE warehouse_type IS NULL;

-- Прив'язати магазини-склади до відповідних магазинів (1:1)
UPDATE household_chemicals.warehouses w
SET parent_shop_id = s.id
FROM household_chemicals.shops s
WHERE w.id = s.warehouse_id AND w.parent_shop_id IS NULL;

COMMENT ON COLUMN household_chemicals.warehouses.warehouse_type IS 'Тип складу: shop - магазин, workshop - цех, storage - склад, other - інше';
COMMENT ON COLUMN household_chemicals.warehouses.parent_shop_id IS 'Прив''язка до магазину (для цехів та складів)';

-- Подання: повний довідник складів з прив'язкою до магазинів
DROP VIEW IF EXISTS household_chemicals.v_warehouse_directory;
CREATE VIEW household_chemicals.v_warehouse_directory AS
SELECT
  w.id,
  w.name,
  w.warehouse_type,
  w.poster_storage_id,
  w.parent_shop_id,
  ps.name AS parent_shop_name,
  w.is_active,
  w.created_at,
  CASE
    WHEN w.warehouse_type = 'shop' THEN 'Магазин'
    WHEN w.warehouse_type = 'workshop' THEN 'Цех'
    WHEN w.warehouse_type = 'storage' THEN 'Склад'
    ELSE 'Інше'
  END AS type_label
FROM household_chemicals.warehouses w
LEFT JOIN household_chemicals.shops ps ON ps.id = w.parent_shop_id
ORDER BY
  CASE w.warehouse_type
    WHEN 'shop' THEN 1 WHEN 'workshop' THEN 2 WHEN 'storage' THEN 3 ELSE 4
  END,
  w.name;

COMMENT ON VIEW household_chemicals.v_warehouse_directory IS 'Довідник: всі склади/цехи/магазини з прив''язкою';

-- RPC для отримання довідника
CREATE OR REPLACE FUNCTION household_chemicals.rpc_warehouse_directory()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'type', w.warehouse_type,
        'type_label', CASE w.warehouse_type
          WHEN 'shop' THEN 'Магазин'
          WHEN 'workshop' THEN 'Цех'
          WHEN 'storage' THEN 'Склад'
          ELSE 'Інше'
        END,
        'poster_storage_id', w.poster_storage_id,
        'parent_shop_id', w.parent_shop_id,
        'parent_shop_name', ps.name,
        'is_active', w.is_active
      )
      ORDER BY
        CASE w.warehouse_type
          WHEN 'shop' THEN 1 WHEN 'workshop' THEN 2 WHEN 'storage' THEN 3 ELSE 4
        END,
        w.name
    ), '[]'::jsonb)
    FROM household_chemicals.warehouses w
    LEFT JOIN household_chemicals.shops ps ON ps.id = w.parent_shop_id
  );
END;
$$;

COMMENT ON FUNCTION household_chemicals.rpc_warehouse_directory IS 'Повертає довідник складів/цехів/магазинів з прив''язками';
