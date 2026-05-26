-- ============================================================================
-- Migration 024 — next_document_number: atomic year + counter
-- ============================================================================
-- Closes L7: between EXTRACT(YEAR FROM CURRENT_DATE) (declared var) and the
-- INSERT/UPDATE, the calendar year can change at midnight. The previous
-- version captured the year in a variable first, so the document number could
-- end up referring to last year while the row inserted for the new year (or
-- vice versa). Race window is tiny but real.
--
-- Fix: compute the year inside the INSERT and read it back from RETURNING.
-- The number string is built from values that are guaranteed to belong to the
-- same row.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION household_chemicals.next_document_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year INT;
    v_next INT;
BEGIN
    INSERT INTO household_chemicals.document_sequences (prefix, year, last_number)
    VALUES (p_prefix, EXTRACT(YEAR FROM CURRENT_DATE)::INT, 1)
    ON CONFLICT (prefix, year)
    DO UPDATE SET last_number = household_chemicals.document_sequences.last_number + 1
    RETURNING year, last_number INTO v_year, v_next;

    RETURN p_prefix || '-' || v_year || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

COMMIT;
