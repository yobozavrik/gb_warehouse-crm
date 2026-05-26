-- ============================================================================
-- Migration 026 — mark active "household" suppliers
-- ============================================================================
-- Goal: distinguish suppliers we actually buy from (delivering to storage 37,
-- "Склад витратних матеріалів") from those we have only by historical data.
-- All 68 rows in `suppliers` came in via migration 008 from Poster — every
-- supplier that touched storage 37 at any point in time. Of those, 39 had
-- supplies in 2025-2026 (with a few obvious data-entry mistakes excluded).
--
-- We add an `is_household_active` boolean. It is:
--   - set automatically on this migration for the 39 known-active ones,
--   - kept up-to-date by a trigger on `receipts.status` → 'confirmed'.
--
-- Manual override is also possible (UPDATE suppliers SET is_household_active
-- = FALSE WHERE id = X) — the trigger only flips FALSE → TRUE, never the
-- other way.
-- ============================================================================

BEGIN;

ALTER TABLE household_chemicals.suppliers
  ADD COLUMN IF NOT EXISTS is_household_active BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_suppliers_household_active
  ON household_chemicals.suppliers(is_household_active)
  WHERE is_household_active = TRUE;

COMMENT ON COLUMN household_chemicals.suppliers.is_household_active IS
  'TRUE if the supplier has delivered to our storage (poster_storage_id=37) at least once. Auto-set by trigger on receipts.';

-- ----------------------------------------------------------------------------
-- Initial backfill — 39 active suppliers by poster_supplier_id (from supplies
-- 2025-01-01 .. now, storage 37, excluding obvious mistakes: 1, 6, 27).
-- ----------------------------------------------------------------------------
UPDATE household_chemicals.suppliers
SET is_household_active = TRUE
WHERE poster_supplier_id = ANY (ARRAY[
   61,  66,  92,  95,  96,  97, 100, 102, 103, 107,
  109, 112, 113, 114, 119, 120, 126, 137, 152, 161,
  163, 164, 167, 169, 170, 172, 173, 174, 176, 182,
  188, 192, 193, 199, 200, 201, 207, 208, 210
]::INT[]);

-- ----------------------------------------------------------------------------
-- Trigger: when a receipt is confirmed for our storage, mark its supplier
-- as active. One-way flip (FALSE → TRUE); never automatic FALSE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION household_chemicals.flag_household_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_our_warehouse_id INT;
BEGIN
    SELECT id INTO v_our_warehouse_id
    FROM household_chemicals.warehouses
    WHERE poster_storage_id = 37
    LIMIT 1;

    IF v_our_warehouse_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'confirmed'
       AND NEW.warehouse_id = v_our_warehouse_id
       AND NEW.supplier_id IS NOT NULL
    THEN
        UPDATE household_chemicals.suppliers
        SET is_household_active = TRUE
        WHERE id = NEW.supplier_id
          AND is_household_active = FALSE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_household_supplier ON household_chemicals.receipts;
CREATE TRIGGER trg_flag_household_supplier
  AFTER INSERT OR UPDATE OF status ON household_chemicals.receipts
  FOR EACH ROW
  EXECUTE FUNCTION household_chemicals.flag_household_supplier();

COMMIT;

-- ============================================================================
-- Post-apply verification
-- ============================================================================
-- SELECT COUNT(*) FROM household_chemicals.suppliers WHERE is_household_active;
-- -- expected: 39
--
-- SELECT id, name, poster_supplier_id FROM household_chemicals.suppliers
-- WHERE is_household_active = FALSE ORDER BY name;
-- -- expected: ~29 "legacy" suppliers (2023-2024 only)
