-- ============================================================================
-- Миграция #7: RPC для детальной карточки товара и каталога категорий
-- ============================================================================

-- 1. RPC: детальная карточка товара
CREATE OR REPLACE FUNCTION household_chemicals.rpc_product_detail(p_product_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product JSONB;
    v_stock JSONB;
    v_receipts JSONB;
    v_price_history JSONB;
    v_supplier JSONB;
BEGIN
    -- Инфо о товаре
    SELECT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'unit', p.unit,
        'purchase_price', p.purchase_price,
        'description', p.description,
        'min_stock', p.min_stock,
        'max_stock', p.max_stock,
        'category_id', pc.id,
        'category_name', pc.name,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'updated_at', p.updated_at
    ) INTO v_product
    FROM household_chemicals.products p
    LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
    WHERE p.id = p_product_id;

    -- Остатки по всем складам
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'warehouse_id', w.id,
        'warehouse_name', w.name,
        'quantity', sb.quantity
    ) ORDER BY w.name), '[]'::jsonb) INTO v_stock
    FROM household_chemicals.warehouses w
    LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id AND sb.product_id = p_product_id
    WHERE w.is_active = true
      AND sb.quantity IS NOT NULL AND sb.quantity != 0;

    -- Последние 5 поступлений
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'receipt_id', r.id,
        'receipt_number', r.receipt_number,
        'receipt_date', r.created_at,
        'supplier_id', s.id,
        'supplier_name', s.name,
        'warehouse_id', w.id,
        'warehouse_name', w.name,
        'quantity', ri.quantity,
        'price', ri.price,
        'total', ri.total
    ) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_receipts
    FROM household_chemicals.receipt_items ri
    JOIN household_chemicals.receipts r ON r.id = ri.receipt_id
    LEFT JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
    LEFT JOIN household_chemicals.warehouses w ON w.id = r.warehouse_id
    WHERE ri.product_id = p_product_id
      AND r.status = 'confirmed'
    LIMIT 5;

    -- История изменения цены (все поступления)
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'date', r.confirmed_at,
        'price', ri.price,
        'receipt_number', r.receipt_number,
        'supplier_name', s.name
    ) ORDER BY r.confirmed_at), '[]'::jsonb) INTO v_price_history
    FROM household_chemicals.receipt_items ri
    JOIN household_chemicals.receipts r ON r.id = ri.receipt_id
    LEFT JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
    WHERE ri.product_id = p_product_id
      AND r.status = 'confirmed'
      AND ri.price IS NOT NULL;

    -- Поставщик (из последнего поступления)
    SELECT jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'contact_person', s.contact_person,
        'phone', s.phone,
        'email', s.email,
        'edrpou', s.edrpou,
        'category', s.category
    ) INTO v_supplier
    FROM household_chemicals.receipt_items ri
    JOIN household_chemicals.receipts r ON r.id = ri.receipt_id
    JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
    WHERE ri.product_id = p_product_id
      AND r.status = 'confirmed'
    ORDER BY r.created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'product', v_product,
        'stock', v_stock,
        'receipts', v_receipts,
        'price_history', v_price_history,
        'supplier', v_supplier
    );
END;
$$;

-- 2. RPC: категории с товарами и остатками
CREATE OR REPLACE FUNCTION household_chemicals.rpc_categories_with_products(
    p_search TEXT DEFAULT NULL,
    p_category_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_categories JSONB;
BEGIN
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'product_count', (
            SELECT COUNT(*) FROM household_chemicals.products p
            WHERE p.category_id = c.id AND p.is_active = true
        ),
        'products', COALESCE((
            SELECT JSONB_AGG(jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'sku', p.sku,
                'unit', p.unit,
                'purchase_price', p.purchase_price,
                'description', p.description,
                'total_stock', COALESCE((SELECT SUM(sb.quantity) FROM household_chemicals.stock_balances sb WHERE sb.product_id = p.id), 0),
                'min_stock', p.min_stock,
                'supplier', (
                    SELECT jsonb_build_object(
                        'id', s.id,
                        'name', s.name
                    )
                    FROM household_chemicals.receipt_items ri
                    JOIN household_chemicals.receipts r ON r.id = ri.receipt_id
                    JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
                    WHERE ri.product_id = p.id AND r.status = 'confirmed'
                    ORDER BY r.created_at DESC
                    LIMIT 1
                )
            ) ORDER BY p.name)
            FROM household_chemicals.products p
            WHERE p.category_id = c.id
              AND p.is_active = true
              AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
        ), '[]'::jsonb)
    ) ORDER BY c.sort_order, c.name), '[]'::jsonb) INTO v_categories
    FROM household_chemicals.product_categories c
    WHERE c.is_active = true
      AND (p_category_id IS NULL OR c.id = p_category_id)
      AND EXISTS (
          SELECT 1 FROM household_chemicals.products p
          WHERE p.category_id = c.id AND p.is_active = true
            AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
      );

    RETURN jsonb_build_object('categories', v_categories);
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_product_detail TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_products TO anon, authenticated, service_role;
