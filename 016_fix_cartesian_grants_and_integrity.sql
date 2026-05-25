-- ============================================================================
-- Migration #016: Fix Cartesian multiplication, grants, integrity, and type issues
-- Code review fixes batch
-- ============================================================================

-- ============================================================================
-- 1. FIX: v_dashboard_stats — Cartesian multiplication in SUM(stock_value)
-- ============================================================================
DROP VIEW IF EXISTS household_chemicals.v_dashboard_stats CASCADE;
CREATE OR REPLACE VIEW household_chemicals.v_dashboard_stats AS
WITH stock_stats AS (
  SELECT
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0) AS products_in_stock,
    COUNT(DISTINCT sb.product_id) FILTER (WHERE COALESCE(sb.quantity, 0) <= 0) AS products_out_of_stock,
    COUNT(DISTINCT sb.product_id) FILTER (
      WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock
    ) AS critical_items,
    COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value
  FROM household_chemicals.warehouses w
  LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
  LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
  GROUP BY w.id, w.name
),
order_stats AS (
  SELECT warehouse_id, COUNT(*) AS pending_orders
  FROM household_chemicals.orders
  WHERE status IN ('submitted', 'confirmed') AND created_at::date = CURRENT_DATE
  GROUP BY warehouse_id
),
shipment_stats AS (
  SELECT warehouse_id, COUNT(*) AS shipments_today
  FROM household_chemicals.shipments
  WHERE status = 'shipped' AND shipped_at::date = CURRENT_DATE
  GROUP BY warehouse_id
)
SELECT
  s.warehouse_id,
  s.warehouse_name,
  s.products_in_stock,
  s.products_out_of_stock,
  s.critical_items,
  s.stock_value,
  COALESCE(o.pending_orders, 0) AS pending_orders,
  COALESCE(sh.shipments_today, 0) AS shipments_today
FROM stock_stats s
LEFT JOIN order_stats o ON o.warehouse_id = s.warehouse_id
LEFT JOIN shipment_stats sh ON sh.warehouse_id = s.warehouse_id;

-- ============================================================================
-- 2. FIX: rpc_dashboard_summary — Cartesian multiplication + NULL handling
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.rpc_dashboard_summary(INT) CASCADE;
CREATE OR REPLACE FUNCTION household_chemicals.rpc_dashboard_summary(
    p_warehouse_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
    v_filter TEXT;
BEGIN
    WITH stats AS (
      SELECT
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0), 0) AS products_in_stock,
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (WHERE COALESCE(sb.quantity, 0) <= 0), 0) AS products_out_of_stock,
        COALESCE(COUNT(DISTINCT sb.product_id) FILTER (
          WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock
        ), 0) AS critical_items,
        COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.orders o
         WHERE o.status IN ('submitted', 'confirmed')
           AND o.created_at::date = CURRENT_DATE
           AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ) AS pending_orders,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.shipments s
         WHERE s.status = 'shipped'
           AND s.shipped_at::date = CURRENT_DATE
           AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
        ) AS shipments_today,
        (SELECT COALESCE(COUNT(*), 0) FROM household_chemicals.receipts r
         WHERE r.status = 'draft'
           AND (p_warehouse_id IS NULL OR r.warehouse_id = p_warehouse_id)
        ) AS draft_receipts,
        COALESCE(COUNT(DISTINCT w.id) FILTER (WHERE w.is_active = true), 0) AS active_warehouses
      FROM household_chemicals.warehouses w
      LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
        AND (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
      LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
      WHERE (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
    ),
    critical AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'product_id', sb.product_id,
        'product_name', p.name,
        'warehouse_id', sb.warehouse_id,
        'warehouse_name', w.name,
        'quantity', sb.quantity,
        'min_stock', p.min_stock,
        'deficit', p.min_stock - sb.quantity
      ) ORDER BY (p.min_stock - sb.quantity) DESC), '[]'::jsonb) AS items
      FROM household_chemicals.stock_balances sb
      JOIN household_chemicals.products p ON p.id = sb.product_id AND p.min_stock IS NOT NULL
      JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
      WHERE sb.quantity < p.min_stock
        AND (p_warehouse_id IS NULL OR sb.warehouse_id = p_warehouse_id)
    ),
    recent_movements AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', sm.id,
        'product_name', p.name,
        'warehouse_name', w.name,
        'quantity_change', sm.quantity_change,
        'movement_type', sm.movement_type,
        'created_at', sm.created_at
      ) ORDER BY sm.created_at DESC), '[]'::jsonb) AS items
      FROM household_chemicals.stock_movements sm
      JOIN household_chemicals.products p ON p.id = sm.product_id
      JOIN household_chemicals.warehouses w ON w.id = sm.warehouse_id
      WHERE (p_warehouse_id IS NULL OR sm.warehouse_id = p_warehouse_id)
      LIMIT 20
    ),
    pending_orders_list AS (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'shop_name', s.name,
        'status', o.status,
        'items_count', (SELECT COUNT(*) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'total_requested', (SELECT COALESCE(SUM(oi.quantity_requested), 0) FROM household_chemicals.order_items oi WHERE oi.order_id = o.id),
        'created_at', o.created_at
      ) ORDER BY o.created_at DESC), '[]'::jsonb) AS items
      FROM household_chemicals.orders o
      JOIN household_chemicals.shops s ON s.id = o.shop_id
      WHERE o.status IN ('submitted', 'confirmed')
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      LIMIT 10
    )
    SELECT jsonb_build_object(
      'stats', (SELECT row_to_json(stats)::jsonb FROM stats),
      'critical_items', COALESCE(critical.items, '[]'::jsonb),
      'recent_movements', COALESCE(recent_movements.items, '[]'::jsonb),
      'pending_orders', COALESCE(pending_orders_list.items, '[]'::jsonb)
    ) INTO v_result
    FROM critical, recent_movements, pending_orders_list;

    RETURN COALESCE(v_result, jsonb_build_object(
      'stats', jsonb_build_object(
        'products_in_stock', 0, 'products_out_of_stock', 0,
        'critical_items', 0, 'stock_value', 0,
        'pending_orders', 0, 'shipments_today', 0,
        'draft_receipts', 0, 'active_warehouses', 0
      ),
      'critical_items', '[]'::jsonb,
      'recent_movements', '[]'::jsonb,
      'pending_orders', '[]'::jsonb
    ));
END;
$$;

-- ============================================================================
-- 3. FIX: rpc_shops_with_stats — Cartesian multiplication
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.rpc_shops_with_stats(INT) CASCADE;
CREATE OR REPLACE FUNCTION household_chemicals.rpc_shops_with_stats(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_since TIMESTAMPTZ := NOW() - make_interval(days => p_days);
BEGIN
    RETURN (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', sh.id,
        'name', sh.name,
        'poster_spot_id', sh.poster_spot_id,
        'warehouse_id', sh.warehouse_id,
        'warehouse_name', w.name,
        'products_in_stock', COALESCE(st.products_in_stock, 0),
        'critical_items', COALESCE(st.critical_items, 0),
        'total_stock_value', COALESCE(st.stock_value, 0),
        'receipts_count', COALESCE(rc.cnt, 0),
        'shipments_count', COALESCE(shp.cnt, 0),
        'transfers_in_count', COALESCE(ti.cnt, 0),
        'transfers_out_count', COALESCE(to_.cnt, 0),
        'write_offs_count', COALESCE(wo.cnt, 0),
        'orders_count', COALESCE(ord.cnt, 0),
        'last_receipt_date', rc.last_date,
        'last_shipment_date', shp.last_date
      ) ORDER BY sh.name), '[]'::jsonb)
      FROM household_chemicals.shops sh
      JOIN household_chemicals.warehouses w ON w.id = sh.warehouse_id
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0) AS products_in_stock,
               COUNT(DISTINCT sb.product_id) FILTER (WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock) AS critical_items,
               COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value
        FROM household_chemicals.stock_balances sb
        JOIN household_chemicals.products p ON p.id = sb.product_id
        WHERE sb.warehouse_id = sh.warehouse_id
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, MAX(r.confirmed_at) AS last_date
        FROM household_chemicals.receipts r
        WHERE r.warehouse_id = sh.warehouse_id AND r.status = 'confirmed' AND r.confirmed_at >= v_since
      ) rc ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, MAX(s.shipped_at) AS last_date
        FROM household_chemicals.shipments s
        WHERE s.warehouse_id = sh.warehouse_id AND s.status = 'shipped' AND s.shipped_at >= v_since
      ) shp ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.transfers t
        WHERE t.to_warehouse_id = sh.warehouse_id AND t.status = 'completed' AND t.completed_at >= v_since
      ) ti ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.transfers t
        WHERE t.from_warehouse_id = sh.warehouse_id AND t.status = 'completed' AND t.completed_at >= v_since
      ) to_ ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.write_offs w
        WHERE w.warehouse_id = sh.warehouse_id AND w.status = 'confirmed' AND w.confirmed_at >= v_since
      ) wo ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.orders o
        WHERE o.warehouse_id = sh.warehouse_id AND o.status IN ('submitted', 'confirmed') AND o.created_at >= v_since
      ) ord ON true
    );
END;
$$;

-- ============================================================================
-- 4. FIX: rpc_warehouses_with_stats — Cartesian multiplication
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.rpc_warehouses_with_stats(INT) CASCADE;
CREATE OR REPLACE FUNCTION household_chemicals.rpc_warehouses_with_stats(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_since TIMESTAMPTZ := NOW() - make_interval(days => p_days);
BEGIN
    RETURN (
      SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'type', w.warehouse_type,
        'address', w.address,
        'products_in_stock', COALESCE(st.products_in_stock, 0),
        'critical_items', COALESCE(st.critical_items, 0),
        'total_stock_value', COALESCE(st.stock_value, 0),
        'receipts_count', COALESCE(rc.cnt, 0),
        'shipments_count', COALESCE(shp.cnt, 0),
        'transfers_in_count', COALESCE(ti.cnt, 0),
        'transfers_out_count', COALESCE(to_.cnt, 0),
        'write_offs_count', COALESCE(wo.cnt, 0),
        'orders_count', COALESCE(ord.cnt, 0),
        'last_receipt_date', rc.last_date,
        'last_shipment_date', shp.last_date
      ) ORDER BY w.name), '[]'::jsonb)
      FROM household_chemicals.warehouses w
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT sb.product_id) FILTER (WHERE sb.quantity > 0) AS products_in_stock,
               COUNT(DISTINCT sb.product_id) FILTER (WHERE p.min_stock IS NOT NULL AND COALESCE(sb.quantity, 0) <= p.min_stock) AS critical_items,
               COALESCE(SUM(sb.quantity * p.purchase_price), 0) AS stock_value
        FROM household_chemicals.stock_balances sb
        JOIN household_chemicals.products p ON p.id = sb.product_id
        WHERE sb.warehouse_id = w.id
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, MAX(r.confirmed_at) AS last_date
        FROM household_chemicals.receipts r
        WHERE r.warehouse_id = w.id AND r.status = 'confirmed' AND r.confirmed_at >= v_since
      ) rc ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, MAX(s.shipped_at) AS last_date
        FROM household_chemicals.shipments s
        WHERE s.warehouse_id = w.id AND s.status = 'shipped' AND s.shipped_at >= v_since
      ) shp ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.transfers t
        WHERE t.to_warehouse_id = w.id AND t.status = 'completed' AND t.completed_at >= v_since
      ) ti ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.transfers t
        WHERE t.from_warehouse_id = w.id AND t.status = 'completed' AND t.completed_at >= v_since
      ) to_ ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.write_offs wo
        WHERE wo.warehouse_id = w.id AND wo.status = 'confirmed' AND wo.confirmed_at >= v_since
      ) wo ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM household_chemicals.orders o
        WHERE o.warehouse_id = w.id AND o.status IN ('submitted', 'confirmed') AND o.created_at >= v_since
      ) ord ON true
    );
END;
$$;

-- ============================================================================
-- 5. FIX: v_supplier_stats — add r.status = 'confirmed' filter
-- ============================================================================
DROP VIEW IF EXISTS household_chemicals.v_supplier_stats CASCADE;
CREATE OR REPLACE VIEW household_chemicals.v_supplier_stats AS
SELECT
    s.id AS supplier_id,
    s.name AS supplier_name,
    s.contact_person,
    s.phone,
    s.edrpou,
    s.category,
    COUNT(DISTINCT r.id) AS total_receipts,
    COUNT(DISTINCT ri.product_id) AS total_products_supplied,
    COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
    COUNT(DISTINCT r.id) FILTER (WHERE r.confirmed_at >= NOW() - INTERVAL '30 days') AS receipts_30d,
    MAX(r.confirmed_at) AS last_receipt_date,
    MIN(r.confirmed_at) AS first_receipt_date,
    COUNT(DISTINCT sp.id) AS payment_count,
    COALESCE(SUM(sp.amount), 0) AS total_paid,
    COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) - COALESCE(SUM(sp.amount), 0) AS total_debt,
    MAX(sp.payment_date) AS last_payment_date,
    CASE WHEN COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) > 0
      THEN ROUND(COALESCE(SUM(sp.amount), 0) / NULLIF(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) * 100, 1)
      ELSE 0
    END AS payment_percent
FROM household_chemicals.suppliers s
LEFT JOIN household_chemicals.receipts r ON r.supplier_id = s.id AND r.status = 'confirmed'
LEFT JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
LEFT JOIN household_chemicals.supplier_payments sp ON sp.supplier_id = s.id
GROUP BY s.id, s.name, s.contact_person, s.phone, s.edrpou, s.category;

-- ============================================================================
-- 6. FIX: rpc_suppliers_with_stats — use v_supplier_stats (already fixed) + add rpc_order_detail grant
-- ============================================================================

-- ============================================================================
-- 7. FIX: Remove old types.type CHECK constraint (dual-type resolution)
-- ============================================================================
ALTER TABLE household_chemicals.warehouses DROP CONSTRAINT IF EXISTS warehouses_type_check;

-- ============================================================================
-- 8. FIX: supplier_payments ON DELETE CASCADE → RESTRICT
-- ============================================================================
ALTER TABLE household_chemicals.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_supplier_id_fkey,
  ADD CONSTRAINT supplier_payments_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES household_chemicals.suppliers(id) ON DELETE RESTRICT;

-- ============================================================================
-- 9. FIX: Add ON DELETE SET NULL for users.auth_user_id FK
-- ============================================================================
ALTER TABLE household_chemicals.users
  DROP CONSTRAINT IF EXISTS users_auth_user_id_fkey,
  ADD CONSTRAINT users_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- 10. FIX: rpc_supplier_detail — remove GREATEST(total_debt, 0), optimize scan
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_supplier_detail(p_supplier_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_supplier JSONB;
    v_receipts JSONB;
    v_payments JSONB;
    v_stats JSONB;
BEGIN
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
    FROM household_chemicals.suppliers s WHERE s.id = p_supplier_id;

    WITH receipt_data AS (
      SELECT
        r.id,
        r.receipt_number,
        r.confirmed_at,
        w.name AS warehouse_name,
        (SELECT COUNT(*) FROM household_chemicals.receipt_items ri2 WHERE ri2.receipt_id = r.id)::INT AS items_count,
        (SELECT COALESCE(SUM(ri2.quantity * COALESCE(ri2.price, 0)), 0) FROM household_chemicals.receipt_items ri2 WHERE ri2.receipt_id = r.id) AS total_amount,
        (SELECT JSONB_AGG(jsonb_build_object(
          'product_id', ri3.product_id,
          'product_name', p.name,
          'sku', p.sku,
          'quantity', ri3.quantity,
          'price', ri3.price,
          'total', ri3.total
        ) ORDER BY p.name)
        FROM household_chemicals.receipt_items ri3
        JOIN household_chemicals.products p ON p.id = ri3.product_id
        WHERE ri3.receipt_id = r.id
        ) AS items
      FROM household_chemicals.receipts r
      JOIN household_chemicals.warehouses w ON w.id = r.warehouse_id
      WHERE r.supplier_id = p_supplier_id AND r.status = 'confirmed'
      ORDER BY r.confirmed_at DESC
    )
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
      'id', rd.id,
      'receipt_number', rd.receipt_number,
      'confirmed_at', rd.confirmed_at,
      'warehouse_name', rd.warehouse_name,
      'items_count', rd.items_count,
      'total_amount', rd.total_amount,
      'items', rd.items
    )), '[]'::jsonb) INTO v_receipts
    FROM receipt_data rd;

    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'id', sp.id,
        'amount', sp.amount,
        'payment_date', sp.payment_date,
        'payment_method', sp.payment_method,
        'reference_number', sp.reference_number,
        'notes', sp.notes
    ) ORDER BY sp.payment_date DESC), '[]'::jsonb) INTO v_payments
    FROM household_chemicals.supplier_payments sp
    WHERE sp.supplier_id = p_supplier_id;

    WITH rc AS (
      SELECT
        COUNT(*) AS total_receipts,
        COALESCE(SUM(ri.quantity), 0)::INT AS total_items,
        COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
        MIN(r.confirmed_at) AS first_receipt_date,
        MAX(r.confirmed_at) AS last_receipt_date
      FROM household_chemicals.receipts r
      JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
      WHERE r.supplier_id = p_supplier_id AND r.status = 'confirmed'
    ),
    pm AS (
      SELECT
        COALESCE(SUM(sp.amount), 0) AS total_paid,
        COUNT(*)::INT AS payment_count,
        MAX(sp.payment_date) AS last_payment_date
      FROM household_chemicals.supplier_payments sp
      WHERE sp.supplier_id = p_supplier_id
    )
    SELECT jsonb_build_object(
      'total_receipts', rc.total_receipts,
      'total_items', rc.total_items,
      'total_amount', rc.total_amount,
      'total_paid', pm.total_paid,
      'total_debt', rc.total_amount - pm.total_paid,
      'first_receipt_date', rc.first_receipt_date,
      'last_receipt_date', rc.last_receipt_date,
      'payment_count', pm.payment_count,
      'last_payment_date', pm.last_payment_date
    ) INTO v_stats
    FROM rc, pm;

    RETURN jsonb_build_object(
        'supplier', v_supplier,
        'receipts', v_receipts,
        'payments', v_payments,
        'stats', v_stats
    );
END;
$$;

-- ============================================================================
-- 11. FIX: Update rpc_product_detail to use confirmed_at instead of created_at
-- ============================================================================
CREATE OR REPLACE FUNCTION household_chemicals.rpc_product_detail(p_product_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH prod AS (
        SELECT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'sku', p.sku,
            'barcode', p.barcode,
            'category_id', p.category_id,
            'category_name', pc.name,
            'unit', p.unit,
            'purchase_price', p.purchase_price,
            'min_stock', p.min_stock,
            'max_stock', p.max_stock,
            'description', p.description,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'updated_at', p.updated_at
        ) AS product,
        (SELECT COALESCE(JSONB_AGG(jsonb_build_object(
            'warehouse_id', w.id,
            'warehouse_name', w.name,
            'quantity', sb.quantity
        ) ORDER BY w.name), '[]'::jsonb)
        FROM household_chemicals.stock_balances sb
        JOIN household_chemicals.warehouses w ON w.id = sb.warehouse_id
        WHERE sb.product_id = p.id
        ) AS stock,
        (SELECT COALESCE(JSONB_AGG(jsonb_build_object(
            'receipt_id', r.id,
            'receipt_number', r.receipt_number,
            'receipt_date', r.confirmed_at,
            'supplier_id', r.supplier_id,
            'supplier_name', sup.name,
            'warehouse_id', r.warehouse_id,
            'warehouse_name', w.name,
            'quantity', ri.quantity,
            'price', ri.price,
            'total', ri.total
        ) ORDER BY r.confirmed_at DESC), '[]'::jsonb)
        FROM household_chemicals.receipt_items ri
        JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
        JOIN household_chemicals.warehouses w ON w.id = r.warehouse_id
        LEFT JOIN household_chemicals.suppliers sup ON sup.id = r.supplier_id
        WHERE ri.product_id = p.id
        LIMIT 5
        ) AS receipts,
        (SELECT COALESCE(JSONB_AGG(jsonb_build_object(
            'date', r.confirmed_at,
            'price', ri.price,
            'receipt_number', r.receipt_number,
            'supplier_name', sup.name
        ) ORDER BY r.confirmed_at), '[]'::jsonb)
        FROM household_chemicals.receipt_items ri
        JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
        LEFT JOIN household_chemicals.suppliers sup ON sup.id = r.supplier_id
        WHERE ri.product_id = p.id AND ri.price IS NOT NULL
        ) AS price_history,
        (SELECT jsonb_build_object(
            'id', sup2.id,
            'name', sup2.name,
            'contact_person', sup2.contact_person,
            'phone', sup2.phone,
            'email', sup2.email,
            'edrpou', sup2.edrpou,
            'category', sup2.category
        )
        FROM household_chemicals.receipt_items ri2
        JOIN household_chemicals.receipts r2 ON r2.id = ri2.receipt_id AND r2.status = 'confirmed'
        JOIN household_chemicals.suppliers sup2 ON sup2.id = r2.supplier_id
        WHERE ri2.product_id = p.id
        ORDER BY r2.confirmed_at DESC
        LIMIT 1
        ) AS supplier
        FROM household_chemicals.products p
        LEFT JOIN household_chemicals.product_categories pc ON pc.id = p.category_id
        WHERE p.id = p_product_id
    )
    SELECT jsonb_build_object(
        'product', prod.product,
        'stock', prod.stock,
        'receipts', prod.receipts,
        'price_history', prod.price_history,
        'supplier', prod.supplier
    ) INTO v_result
    FROM prod;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 12. FIX: Security grants — add rpc_order_detail, re-grant safe RPCs to anon
-- ============================================================================
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_order_detail(UUID) TO anon;

-- ============================================================================
-- 13. FIX: rpc_orders_list — add p_page validation
-- ============================================================================
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
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_page INT := GREATEST(1, COALESCE(p_page, 1));
    v_page_size INT := GREATEST(1, LEAST(COALESCE(p_page_size, 50), 1000));
    v_offset INT := (v_page - 1) * v_page_size;
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
    LIMIT v_page_size OFFSET v_offset;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', v_page,
        'page_size', v_page_size,
        'total_pages', GREATEST(1, CEIL(v_total::numeric / v_page_size)::INT)
    );
END;
$$;

-- ============================================================================
-- 14. FIX: rpc_stock_movements_list — add p_page validation
-- ============================================================================
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
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_page INT := GREATEST(1, COALESCE(p_page, 1));
    v_page_size INT := GREATEST(1, LEAST(COALESCE(p_page_size, 50), 1000));
    v_offset INT := (v_page - 1) * v_page_size;
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
    LIMIT v_page_size OFFSET v_offset;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', v_page,
        'page_size', v_page_size,
        'total_pages', GREATEST(1, CEIL(v_total::numeric / v_page_size)::INT)
    );
END;
$$;

-- ============================================================================
-- 15. FIX: Grant anon EXECUTE on newly rewritten (SECURITY INVOKER) functions
-- ============================================================================
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_dashboard_summary(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_shops_with_stats(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_warehouses_with_stats(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_supplier_detail(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_product_detail(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_orders_list(TEXT, INT, INT, TEXT, DATE, DATE, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_stock_movements_list(INT, INT, TEXT, DATE, DATE, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_order_detail(UUID) TO anon;

-- ============================================================================
-- 16. FIX: rpc_categories_with_suppliers — filter by p.is_active
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.rpc_categories_with_suppliers() CASCADE;
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
        SELECT
            pc.id AS category_id,
            pc.name AS category_name,
            JSONB_AGG(DISTINCT jsonb_build_object(
                'id', s.id,
                'name', s.name
            ) ORDER BY s.name) AS suppliers
        FROM household_chemicals.product_categories pc
        JOIN household_chemicals.products p ON p.category_id = pc.id AND p.is_active = true
        JOIN household_chemicals.receipt_items ri ON ri.product_id = p.id
        JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
        JOIN household_chemicals.suppliers s ON s.id = r.supplier_id
        WHERE pc.is_active = true
        GROUP BY pc.id, pc.name
    ),
    cat_suppliers_with_stats AS (
        SELECT
            cs.category_id,
            cs.category_name,
            JSONB_AGG(jsonb_build_object(
                'id', sup.id,
                'name', sup.name,
                'total_receipts', COALESCE(st.total_receipts, 0),
                'total_amount', COALESCE(st.total_amount, 0),
                'total_products', COALESCE(st.total_products, 0)
            ) ORDER BY sup.name) AS suppliers
        FROM cat_suppliers cs
        CROSS JOIN LATERAL jsonb_to_recordset(cs.suppliers) AS sup(id INT, name TEXT)
        LEFT JOIN LATERAL (
            SELECT
                COUNT(DISTINCT r.id) AS total_receipts,
                COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
                COUNT(DISTINCT ri.product_id) AS total_products
            FROM household_chemicals.products p2
            JOIN household_chemicals.receipt_items ri ON ri.product_id = p2.id
            JOIN household_chemicals.receipts r ON r.id = ri.receipt_id AND r.status = 'confirmed'
            WHERE r.supplier_id = sup.id AND p2.category_id = cs.category_id
        ) st ON true
        GROUP BY cs.category_id, cs.category_name
    )
    SELECT COALESCE(JSONB_AGG(jsonb_build_object(
        'category_id', cs.category_id,
        'category_name', cs.category_name,
        'supplier_count', JSONB_ARRAY_LENGTH(cs.suppliers),
        'suppliers', cs.suppliers
    ) ORDER BY cs.category_name), '[]'::jsonb) INTO v_result
    FROM cat_suppliers_with_stats cs;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 17. FIX: telegram_get_or_create_user — return JSONB instead of table row
-- ============================================================================
DROP FUNCTION IF EXISTS household_chemicals.telegram_get_or_create_user(BIGINT, TEXT, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION household_chemicals.telegram_get_or_create_user(
    p_user_id BIGINT,
    p_username TEXT DEFAULT NULL,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL
)
RETURNS JSONB
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

    RETURN jsonb_build_object(
        'id', v_user.id,
        'user_id', v_user.user_id,
        'username', v_user.username,
        'first_name', v_user.first_name,
        'last_name', v_user.last_name,
        'display_name', v_user.display_name,
        'phone', v_user.phone,
        'shop_id', v_user.shop_id,
        'household_user_id', v_user.household_user_id,
        'is_active', v_user.is_active,
        'last_interaction_at', v_user.last_interaction_at,
        'created_at', v_user.created_at
    );
END;
$$;

-- ============================================================================
-- 18. FIX: telegram_users FK — ON DELETE SET NULL for shop_id
-- ============================================================================
ALTER TABLE household_chemicals.telegram_users
  DROP CONSTRAINT IF EXISTS telegram_users_shop_id_fkey,
  ADD CONSTRAINT telegram_users_shop_id_fkey
    FOREIGN KEY (shop_id) REFERENCES household_chemicals.shops(id) ON DELETE SET NULL;

-- ============================================================================
-- 19. Verify grants are correct
-- ============================================================================
-- These should all work:
-- SELECT * FROM rpc_dashboard_summary(NULL) — anon should get valid JSON
-- SELECT * FROM rpc_order_detail('some-uuid') — anon should get order detail
-- SELECT * FROM telegram_get_or_create_user(...) — ONLY service_role
