-- ============================================================================
-- Миграция #4: RPC для статистики по магазинам и складам
-- ============================================================================

-- 1. Статистика по магазинам
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

-- 2. Статистика по складах/цехах
CREATE OR REPLACE FUNCTION household_chemicals.rpc_warehouses_with_stats(p_days INT DEFAULT 14)
RETURNS TABLE (
    id INT,
    name TEXT,
    type TEXT,
    address TEXT,
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
        w.id,
        w.name,
        w.type,
        w.address,
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
    FROM household_chemicals.warehouses w
    LEFT JOIN household_chemicals.stock_balances sb ON sb.warehouse_id = w.id
    LEFT JOIN household_chemicals.products p ON p.id = sb.product_id
    LEFT JOIN household_chemicals.receipts r ON r.warehouse_id = w.id
    LEFT JOIN household_chemicals.shipments sh ON sh.warehouse_id = w.id
    LEFT JOIN household_chemicals.transfers t ON t.from_warehouse_id = w.id OR t.to_warehouse_id = w.id
    LEFT JOIN household_chemicals.write_offs wo ON wo.warehouse_id = w.id
    LEFT JOIN household_chemicals.orders o ON o.warehouse_id = w.id
    GROUP BY w.id, w.name, w.type, w.address
    ORDER BY w.name;
END;
$$;

-- 3. Права на выполнение
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_shops_with_stats TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_warehouses_with_stats TO anon, authenticated, service_role;
