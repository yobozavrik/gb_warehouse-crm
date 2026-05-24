-- Migration #10: Supplier payments and mutual settlements
-- Adds payment tracking for suppliers and updates stats RPC

-- 1. Supplier payments table
CREATE TABLE IF NOT EXISTS household_chemicals.supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id INT NOT NULL REFERENCES household_chemicals.suppliers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method TEXT,
    reference_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES household_chemicals.users(auth_user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE household_chemicals.supplier_payments IS 'Supplier payments and mutual settlements tracking';

CREATE INDEX idx_supplier_payments_supplier ON household_chemicals.supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_date ON household_chemicals.supplier_payments(payment_date);

CREATE TRIGGER trg_supplier_payments_audit
    BEFORE INSERT OR UPDATE OR DELETE ON household_chemicals.supplier_payments
    FOR EACH ROW EXECUTE FUNCTION household_chemicals.trigger_audit();

CREATE TRIGGER trg_supplier_payments_updated_at
    BEFORE UPDATE ON household_chemicals.supplier_payments
    FOR EACH ROW EXECUTE FUNCTION household_chemicals.trigger_set_updated_at();

DROP VIEW IF EXISTS household_chemicals.v_supplier_stats;
CREATE VIEW household_chemicals.v_supplier_stats AS
WITH stats AS (
    SELECT
        sup.id,
        COUNT(DISTINCT r.id) AS total_receipts,
        COUNT(DISTINCT ri.product_id) AS total_products_supplied,
        COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) AS total_amount,
        COUNT(DISTINCT r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days') AS receipts_30d,
        MAX(r.created_at) AS last_receipt_date,
        MIN(r.created_at) AS first_receipt_date
    FROM household_chemicals.suppliers sup
    LEFT JOIN household_chemicals.receipts r ON r.supplier_id = sup.id AND r.status = 'confirmed'
    LEFT JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
    GROUP BY sup.id
),
payments AS (
    SELECT
        p.supplier_id,
        COALESCE(SUM(p.amount), 0) AS total_paid,
        COUNT(p.id) AS payment_count,
        MAX(p.payment_date) AS last_payment_date
    FROM household_chemicals.supplier_payments p
    GROUP BY p.supplier_id
)
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
    COALESCE(s.total_receipts, 0) AS total_receipts,
    COALESCE(s.total_products_supplied, 0) AS total_products_supplied,
    COALESCE(s.total_amount, 0) AS total_amount,
    COALESCE(s.receipts_30d, 0) AS receipts_30d,
    s.last_receipt_date,
    s.first_receipt_date,
    COALESCE(p.total_paid, 0) AS total_paid,
    COALESCE(s.total_amount, 0) - COALESCE(p.total_paid, 0) AS total_debt,
    COALESCE(p.payment_count, 0) AS payment_count,
    p.last_payment_date,
    CASE
        WHEN COALESCE(s.total_amount, 0) > 0 THEN
            ROUND((COALESCE(p.total_paid, 0) / NULLIF(s.total_amount, 0)) * 100, 1)
        ELSE 0
    END AS payment_percent
FROM household_chemicals.suppliers sup
LEFT JOIN stats s ON s.id = sup.id
LEFT JOIN payments p ON p.supplier_id = sup.id;

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
    first_receipt_date TIMESTAMPTZ,
    total_paid NUMERIC,
    total_debt NUMERIC,
    payment_count BIGINT,
    last_payment_date TIMESTAMPTZ,
    payment_percent NUMERIC
) LANGUAGE plpgsql STABLE AS $function$
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
        MIN(r.created_at),
        COALESCE(p.total_paid, 0),
        COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) - COALESCE(p.total_paid, 0),
        COALESCE(p.payment_count, 0)::BIGINT,
        p.last_payment_date,
        CASE
            WHEN COALESCE(SUM(ri.quantity * COALESCE(ri.price, 0)), 0) > 0 THEN
                ROUND((COALESCE(p.total_paid, 0) / NULLIF(SUM(ri.quantity * COALESCE(ri.price, 0)), 0)) * 100, 1)
            ELSE 0
        END
    FROM household_chemicals.suppliers sup
    LEFT JOIN household_chemicals.receipts r ON r.supplier_id = sup.id AND r.status = 'confirmed'
    LEFT JOIN household_chemicals.receipt_items ri ON ri.receipt_id = r.id
    LEFT JOIN LATERAL (
        SELECT
            sp.supplier_id,
            COALESCE(SUM(sp.amount), 0) AS total_paid,
            COUNT(sp.id) AS payment_count,
            MAX(sp.payment_date) AS last_payment_date
        FROM household_chemicals.supplier_payments sp
        WHERE sp.supplier_id = sup.id
        GROUP BY sp.supplier_id
    ) p ON true
    GROUP BY sup.id, p.total_paid, p.payment_count, p.last_payment_date
    ORDER BY sup.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION household_chemicals.rpc_suppliers_with_stats TO anon, authenticated, service_role;

ALTER TABLE household_chemicals.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON household_chemicals.supplier_payments
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow read for anon" ON household_chemicals.supplier_payments
    FOR SELECT TO anon
    USING (true);

GRANT ALL ON household_chemicals.supplier_payments TO anon, authenticated, service_role;
