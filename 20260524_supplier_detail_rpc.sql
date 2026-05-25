-- Migration #12: Supplier detail RPC with receipts, items, and payments

CREATE OR REPLACE FUNCTION household_chemicals.rpc_supplier_detail(p_supplier_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supplier JSONB;
    v_receipts JSONB;
    v_payments JSONB;
    v_stats JSONB;
BEGIN
    -- Supplier info
    SELECT jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'contact_person', s.contact_person,
        'phone', s.phone,
        'email', s.email,
        'edrpou', s.edrpou,
        'category', s.category,
        'website', s.website,
        'payment_days', s.payment_days,
        'notes', s.notes,
        'created_at', s.created_at
    ) INTO v_supplier
    FROM household_chemicals.suppliers s
    WHERE s.id = p_supplier_id;

    IF v_supplier IS NULL THEN
        RETURN NULL;
    END IF;

    -- Receipts with items
    SELECT COALESCE(JSONB_AGG(
        jsonb_build_object(
            'id', r.id,
            'receipt_number', r.receipt_number,
            'confirmed_at', r.confirmed_at,
            'warehouse_name', w.name,
            'items_count', ri_stats.items_count,
            'total_amount', ri_stats.total_amount,
            'items', ri_stats.items
        )
        ORDER BY r.confirmed_at DESC
    ), '[]'::jsonb) INTO v_receipts
    FROM household_chemicals.receipts r
    JOIN household_chemicals.warehouses w ON w.id = r.warehouse_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)::INT AS items_count,
            COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
            COALESCE(jsonb_agg(
                jsonb_build_object(
                    'product_id', p.id,
                    'product_name', p.name,
                    'sku', p.sku,
                    'quantity', ri.quantity,
                    'price', ri.price,
                    'total', ri.quantity * COALESCE(ri.price, 0)
                )
                ORDER BY p.name
            ), '[]'::jsonb) AS items
        FROM household_chemicals.receipt_items ri
        JOIN household_chemicals.products p ON p.id = ri.product_id
        WHERE ri.receipt_id = r.id
    ) ri_stats ON true
    WHERE r.supplier_id = p_supplier_id AND r.status = 'confirmed';

    -- Payments
    SELECT COALESCE(JSONB_AGG(
        jsonb_build_object(
            'id', sp.id,
            'amount', sp.amount,
            'payment_date', sp.payment_date,
            'payment_method', sp.payment_method,
            'reference_number', sp.reference_number,
            'notes', sp.notes
        )
        ORDER BY sp.payment_date DESC
    ), '[]'::jsonb) INTO v_payments
    FROM household_chemicals.supplier_payments sp
    WHERE sp.supplier_id = p_supplier_id;

    -- Stats
    SELECT jsonb_build_object(
        'total_receipts', COALESCE((rc.stats->>'total_receipts')::INT, 0),
        'total_items', COALESCE((rc.stats->>'total_items')::INT, 0),
        'total_amount', COALESCE((rc.stats->>'total_amount')::NUMERIC, 0),
        'total_paid', COALESCE((pm.stats->>'total_paid')::NUMERIC, 0),
        'total_debt', GREATEST(
            COALESCE((rc.stats->>'total_amount')::NUMERIC, 0) - COALESCE((pm.stats->>'total_paid')::NUMERIC, 0),
            0
        ),
        'first_receipt_date', rc.stats->>'first_date',
        'last_receipt_date', rc.stats->>'last_date',
        'payment_count', COALESCE((pm.stats->>'payment_count')::INT, 0),
        'last_payment_date', pm.stats->>'last_date'
    ) INTO v_stats
    FROM (
        SELECT jsonb_build_object(
            'total_receipts', COUNT(DISTINCT r.id),
            'total_items', COUNT(DISTINCT ri.id),
            'total_amount', COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0),
            'first_date', MIN(r.confirmed_at)::TEXT,
            'last_date', MAX(r.confirmed_at)::TEXT
        )::jsonb AS stats
        FROM household_chemicals.receipts r
        JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
        WHERE r.supplier_id = p_supplier_id AND r.status = 'confirmed'
    ) rc
    CROSS JOIN (
        SELECT jsonb_build_object(
            'total_paid', COALESCE(SUM(sp.amount), 0),
            'payment_count', COUNT(*),
            'last_date', MAX(sp.payment_date)::TEXT
        )::jsonb AS stats
        FROM household_chemicals.supplier_payments sp
        WHERE sp.supplier_id = p_supplier_id
    ) pm;

    RETURN jsonb_build_object(
        'supplier', v_supplier,
        'receipts', v_receipts,
        'payments', v_payments,
        'stats', v_stats
    );
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_supplier_detail TO anon, authenticated, service_role;
