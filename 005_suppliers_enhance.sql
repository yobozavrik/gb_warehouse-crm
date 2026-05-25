-- ============================================================================
-- Миграция #5: Доработка справочника поставщиков
-- ============================================================================

-- 1. Дополнительные поля поставщиков
ALTER TABLE household_chemicals.suppliers
    ADD COLUMN IF NOT EXISTS edrpou TEXT,
    ADD COLUMN IF NOT EXISTS payment_days INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('manufacturer', 'distributor', 'importer', 'other'));

-- 2. Представление аналитики по поставщикам
CREATE OR REPLACE VIEW household_chemicals.v_supplier_stats AS
SELECT
    sup.id,
    sup.name,
    sup.contact_person,
    sup.phone,
    sup.email,
    sup.edrpou,
    sup.payment_days,
    sup.category,
    sup.is_active,
    COUNT(DISTINCT r.id) AS total_receipts,
    COUNT(DISTINCT ri.product_id) AS total_products_supplied,
    COALESCE(SUM(ri.quantity * ri.price), 0) AS total_amount,
    COUNT(DISTINCT r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days') AS receipts_30d,
    MAX(r.created_at) AS last_receipt_date,
    MIN(r.created_at) AS first_receipt_date
FROM household_chemicals.suppliers sup
LEFT JOIN household_chemicals.receipts r ON r.supplier_id = sup.id
LEFT JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
GROUP BY sup.id, sup.name, sup.contact_person, sup.phone, sup.email,
         sup.edrpou, sup.payment_days, sup.category, sup.is_active;

-- 3. RPC: поставщики со статистикой
CREATE OR REPLACE FUNCTION household_chemicals.rpc_suppliers_with_stats()
RETURNS TABLE (
    id INT,
    name TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    edrpou TEXT,
    payment_days INT,
    category TEXT,
    website TEXT,
    notes TEXT,
    is_active BOOLEAN,
    total_receipts BIGINT,
    total_products_supplied BIGINT,
    total_amount NUMERIC,
    receipts_30d BIGINT,
    last_receipt_date TIMESTAMPTZ,
    first_receipt_date TIMESTAMPTZ
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        sup.id,
        sup.name,
        sup.contact_person,
        sup.phone,
        sup.email,
        sup.address,
        sup.edrpou,
        sup.payment_days,
        sup.category,
        sup.website,
        sup.notes,
        sup.is_active,
        COUNT(DISTINCT r.id)::BIGINT,
        COUNT(DISTINCT ri.product_id)::BIGINT,
        COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0),
        COUNT(DISTINCT r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days')::BIGINT,
        MAX(r.created_at),
        MIN(r.created_at)
    FROM household_chemicals.suppliers sup
    LEFT JOIN household_chemicals.receipts r ON r.supplier_id = sup.id AND r.status = 'confirmed'
    LEFT JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
    GROUP BY sup.id
    ORDER BY sup.name;
END;
$$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_suppliers_with_stats TO anon, authenticated, service_role;
