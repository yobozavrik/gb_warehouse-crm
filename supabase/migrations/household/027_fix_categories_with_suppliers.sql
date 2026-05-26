-- ============================================================================
-- Migration 027 — fix rpc_categories_with_suppliers (42P10 error)
-- ============================================================================
-- The previous version (mig 016) used
--   JSONB_AGG(DISTINCT jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
-- which is rejected by PostgreSQL with:
--   42P10: "in an aggregate with DISTINCT, ORDER BY expressions must appear
--           in argument list"
-- The ORDER BY uses `s.name`, but DISTINCT is on the jsonb_build_object —
-- these don't match. PG accepts this only when ORDER BY is a function of
-- the DISTINCT argument.
--
-- Fix: deduplicate suppliers BEFORE aggregating, in a subquery, then
-- jsonb_agg(... ORDER BY name) plain.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION household_chemicals.rpc_categories_with_suppliers()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH cat_suppliers AS (
        -- One row per (category, supplier) pair that ever sold us something.
        SELECT DISTINCT
            pc.id   AS category_id,
            pc.name AS category_name,
            s.id    AS supplier_id,
            s.name  AS supplier_name
        FROM household_chemicals.product_categories pc
        JOIN household_chemicals.products p
          ON p.category_id = pc.id AND p.is_active = TRUE
        JOIN household_chemicals.receipt_items ri
          ON ri.product_id = p.id
        JOIN household_chemicals.receipts r
          ON r.id = ri.receipt_id AND r.status = 'confirmed'
        JOIN household_chemicals.suppliers s
          ON s.id = r.supplier_id
        WHERE pc.is_active = TRUE
    ),
    sup_stats AS (
        -- Per supplier-in-category stats. One row per (cat, sup).
        SELECT
            cs.category_id,
            cs.category_name,
            cs.supplier_id,
            cs.supplier_name,
            COALESCE(st.total_receipts, 0) AS total_receipts,
            COALESCE(st.total_amount, 0)   AS total_amount,
            COALESCE(st.total_products, 0) AS total_products
        FROM cat_suppliers cs
        LEFT JOIN LATERAL (
            SELECT
                COUNT(DISTINCT r.id)                                AS total_receipts,
                COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
                COUNT(DISTINCT ri.product_id)                       AS total_products
            FROM household_chemicals.products p2
            JOIN household_chemicals.receipt_items ri ON ri.product_id = p2.id
            JOIN household_chemicals.receipts r
              ON r.id = ri.receipt_id AND r.status = 'confirmed'
            WHERE r.supplier_id   = cs.supplier_id
              AND p2.category_id  = cs.category_id
        ) st ON TRUE
    )
    SELECT COALESCE(JSONB_AGG(cat ORDER BY cat->>'category_name'), '[]'::jsonb)
    INTO v_result
    FROM (
        -- Per category: build the suppliers array (sorted by name) and meta.
        SELECT jsonb_build_object(
            'category_id',    category_id,
            'category_name',  category_name,
            'supplier_count', COUNT(*),
            'suppliers',      JSONB_AGG(
                                jsonb_build_object(
                                  'id',             supplier_id,
                                  'name',           supplier_name,
                                  'total_receipts', total_receipts,
                                  'total_amount',   total_amount,
                                  'total_products', total_products
                                )
                                ORDER BY supplier_name
                              )
        ) AS cat
        FROM sup_stats
        GROUP BY category_id, category_name
    ) per_cat;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_suppliers() TO anon, authenticated;

COMMIT;

-- ============================================================================
-- Post-apply verification
-- ============================================================================
-- SELECT jsonb_array_length(household_chemicals.rpc_categories_with_suppliers());
-- -- expected: 5–10 categories
--
-- SELECT household_chemicals.rpc_categories_with_suppliers()->0;
-- -- expected: { category_id, category_name, supplier_count, suppliers: [...] }
