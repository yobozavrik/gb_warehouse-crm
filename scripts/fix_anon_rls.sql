-- ⚠️⚠️⚠️  DANGER: This script gives anon SELECT-only access to all tables in household_chemicals.
-- It does NOT grant ANY write access. For write operations, use per-function GRANTs.
-- DO NOT use GRANT ALL - that would let anon call SECURITY DEFINER functions (stock writes, orders, etc.)
-- ⚠️⚠️⚠️

-- Only SELECT - no write access
GRANT SELECT ON ALL TABLES IN SCHEMA household_chemicals TO anon, authenticated;

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'household_chemicals'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS anon_read_all ON household_chemicals.%I;', rec.tablename);
        EXECUTE format('CREATE POLICY anon_read_all ON household_chemicals.%I FOR SELECT TO anon USING (true);', rec.tablename);
    END LOOP;
END;
$$;
