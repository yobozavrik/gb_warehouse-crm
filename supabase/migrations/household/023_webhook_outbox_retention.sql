-- ============================================================================
-- Migration 023 — webhook_outbox retention
-- ============================================================================
-- Closes M4 (decision: keep table, add retention).
--
-- Context: webhook_outbox accumulates one row per orders.status change via
-- trg_order_webhook. Nothing currently reads from it — there is no dispatcher
-- yet. To prevent unbounded growth, this migration:
--
--   1. Adds an explicit `cleanup_webhook_outbox(p_days INT DEFAULT 30)`
--      function that deletes rows older than the cutoff.
--      Safe to call manually from Supabase Studio anytime.
--
--   2. If `pg_cron` is available, schedules it to run daily at 03:00 UTC.
--      If pg_cron is NOT installed, the function still exists and can be
--      called manually or via an external scheduler later.
--
-- When/if a dispatcher gets built later, only `status = 'pending'` rows older
-- than the cutoff get deleted — successfully-sent ones (status = 'sent') are
-- kept indefinitely so they remain auditable.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION household_chemicals.cleanup_webhook_outbox(
    p_days INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM household_chemicals.webhook_outbox
    WHERE status IN ('pending', 'failed', 'cancelled')
      AND created_at < NOW() - make_interval(days => GREATEST(p_days, 1));

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION household_chemicals.cleanup_webhook_outbox(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION household_chemicals.cleanup_webhook_outbox(INT) TO service_role;

-- Try to schedule. If pg_cron is missing this just raises — wrap in DO block
-- so the migration keeps applying.
DO $$
BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
    IF FOUND THEN
        -- Remove any previous job with the same name to make this idempotent.
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'household_chemicals_webhook_outbox_cleanup';

        PERFORM cron.schedule(
            'household_chemicals_webhook_outbox_cleanup',
            '0 3 * * *',  -- daily 03:00 UTC
            $cron$SELECT household_chemicals.cleanup_webhook_outbox(30);$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed — call household_chemicals.cleanup_webhook_outbox() manually or schedule externally';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-apply verification
-- ============================================================================
-- 1. Manual run:
--    SELECT household_chemicals.cleanup_webhook_outbox(30);
--    -- Returns number of rows deleted.
--
-- 2. If pg_cron is installed, the schedule shows up:
--    SELECT jobname, schedule, command
--    FROM cron.job
--    WHERE jobname = 'household_chemicals_webhook_outbox_cleanup';
