-- Migration #15: Fix security - revoke dangerous GRANT ALL, anon gets SELECT only

-- 1. Supplier payments - anon had GRANT ALL (financial data!), revoke write
REVOKE ALL ON household_chemicals.supplier_payments FROM anon, authenticated;
GRANT SELECT ON household_chemicals.supplier_payments TO anon, authenticated;

-- 2. All other tables - ensure anon has SELECT only, no write
REVOKE ALL ON ALL TABLES IN SCHEMA household_chemicals FROM anon;
GRANT SELECT ON ALL TABLES IN SCHEMA household_chemicals TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA household_chemicals TO authenticated;

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from anon (safety measure)
-- Read-only RPCs are safe and need anon access for the frontend
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA household_chemicals FROM anon;

-- 4. Re-grant EXECUTE only to safe read-only RPCs that frontend needs
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_product_detail(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_products(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_tree() TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_product_catalog(INT, TEXT, INT, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_shops_with_stats(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_warehouses_with_stats(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_suppliers_with_stats() TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_supplier_detail(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_categories_with_suppliers() TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_warehouse_directory() TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_dashboard_summary(INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_orders_list(TEXT, INT, INT, TEXT, DATE, DATE, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION household_chemicals.rpc_stock_movements_list(INT, INT, TEXT, DATE, DATE, INT, INT) TO anon;

-- 5. Telegram functions - revoke from PUBLIC, re-grant only to service_role
-- These are called ONLY by the webhook which uses service_role key
REVOKE ALL ON FUNCTION household_chemicals.telegram_get_or_create_user(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION household_chemicals.telegram_log_message(INT, BIGINT, INT, TEXT, TEXT, TEXT, JSONB, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION household_chemicals.telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION household_chemicals.telegram_check_order_status(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION household_chemicals.telegram_get_or_create_user(BIGINT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION household_chemicals.telegram_log_message(INT, BIGINT, INT, TEXT, TEXT, TEXT, JSONB, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION household_chemicals.telegram_create_order(INT, INT, INT, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION household_chemicals.telegram_check_order_status(TEXT) TO service_role;
