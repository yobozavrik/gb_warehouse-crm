-- Migration #11: RPC to get categories with their suppliers
-- Fixed: uses CROSS JOIN LATERAL to avoid duplicates
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
        COUNT(sup.id)::BIGINT,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', sup.id,
                    'name', sup.name,
                    'total_receipts', COALESCE(cat_stats.total_receipts, 0),
                    'total_amount', COALESCE(cat_stats.total_amount, 0),
                    'total_products', COALESCE(cat_stats.total_products, 0)
                )
                ORDER BY sup.name
            ),
            '[]'::jsonb
        )
    FROM household_chemicals.product_categories pc
    CROSS JOIN LATERAL (
        SELECT DISTINCT s.id, s.name
        FROM household_chemicals.products p
        JOIN household_chemicals.receipt_items ri ON ri.product_id = p.id
        JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
        JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
        WHERE p.category_id = pc.id AND p.is_active = true
    ) sup
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
END;
$func$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_suppliers TO anon, authenticated, service_role;
