-- Migration #11: RPC to get categories with their suppliers
CREATE OR REPLACE FUNCTION household_chemicals.rpc_categories_with_suppliers()
RETURNS TABLE (
    category_id INT,
    category_name TEXT,
    supplier_count BIGINT,
    suppliers JSONB
) LANGUAGE plpgsql STABLE AS $func$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.name,
        COUNT(DISTINCT sup.id)::BIGINT,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', sup.id,
                    'name', sup.name,
                    'total_receipts', cat_stats.total_receipts,
                    'total_amount', cat_stats.total_amount,
                    'total_products', cat_stats.total_products
                )
                ORDER BY sup.name
            ) FILTER (WHERE sup.id IS NOT NULL),
            '[]'::jsonb
        )
    FROM household_chemicals.product_categories pc
    LEFT JOIN household_chemicals.products p ON p.category_id = pc.id AND p.is_active = true
    LEFT JOIN household_chemicals.receipt_items ri ON ri.product_id = p.id
    LEFT JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
    LEFT JOIN household_chemicals.suppliers sup ON sup.id = r.supplier_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(DISTINCT r2.id)::BIGINT AS total_receipts,
            COALESCE(SUM(ri2.quantity * COALESCE(ri2.price, 0)), 0) AS total_amount,
            COUNT(DISTINCT ri2.product_id)::BIGINT AS total_products
        FROM household_chemicals.receipts r2
        JOIN household_chemicals.receipt_items ri2 ON ri2.receipt_id = r2.id
        JOIN household_chemicals.products p2 ON p2.id = ri2.product_id
        WHERE r2.supplier_id = sup.id
          AND r2.status = 'confirmed'
          AND p2.category_id = pc.id
    ) cat_stats ON true
    GROUP BY pc.id, pc.name
    ORDER BY pc.name;

    -- If no data found, return empty set
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0::INT, ''::TEXT, 0::BIGINT, '[]'::JSONB WHERE false;
    END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_suppliers TO anon, authenticated, service_role;
