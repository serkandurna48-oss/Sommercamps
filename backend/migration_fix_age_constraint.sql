-- ============================================================
-- Migration: Replace age CHECK constraint with plausibility check
--
-- BEFORE APPLYING:
--   1. Take a Supabase snapshot (Dashboard → Database → Backups
--      or pg_dump of camp_registrations).
--   2. Run pre-check query and confirm 0 rows:
--
--        SELECT id, child_first_name, child_last_name, birth_date,
--               age(birth_date) AS current_age, status
--        FROM camp_registrations
--        WHERE birth_date <= (current_date - interval '13 years')
--          AND status NOT IN ('cancelled')
--        ORDER BY birth_date ASC;
--
-- WHY:
--   The old constraint (chk_birth_date_range) checked age against
--   current_date at INSERT time, not against the camp start date.
--   A child who is 12 at registration could turn 13 before the camp.
--   The correct age rule (5–12 years at camp start) is enforced in
--   application logic (Pydantic model_validator), where the camp
--   start date is available. The DB constraint becomes a structural
--   plausibility guard only.
--
-- CONSTRAINT NAME CHANGE:
--   chk_birth_date_range  →  chk_birth_date_plausible
--   (name reflects the reduced scope)
-- ============================================================


-- ── UP ────────────────────────────────────────────────────────────────────────

BEGIN;

-- Idempotent: drop both names so the migration is safe to re-run.
ALTER TABLE camp_registrations
    DROP CONSTRAINT IF EXISTS chk_birth_date_range;
ALTER TABLE camp_registrations
    DROP CONSTRAINT IF EXISTS chk_birth_date_plausible;

-- Plausibility only: not in the future, not more than 25 years ago.
-- The 25-year ceiling is intentionally wide to give admin headroom
-- (e.g., registering an older helper's child) without allowing
-- obviously nonsensical data. The 5–12-year business rule is
-- enforced in the Pydantic validator against camp_start_date.
ALTER TABLE camp_registrations
    ADD CONSTRAINT chk_birth_date_plausible
        CHECK (
            birth_date <= current_date                               -- not in the future
            AND birth_date >= (current_date - interval '25 years')   -- sanity ceiling
        );

COMMIT;


-- ── DOWN (revert to original) ─────────────────────────────────────────────────
--
-- BEGIN;
--
-- ALTER TABLE camp_registrations
--     DROP CONSTRAINT IF EXISTS chk_birth_date_plausible;
-- ALTER TABLE camp_registrations
--     DROP CONSTRAINT IF EXISTS chk_birth_date_range;
--
-- ALTER TABLE camp_registrations
--     ADD CONSTRAINT chk_birth_date_range
--         CHECK (birth_date BETWEEN (current_date - interval '18 years')
--                                AND (current_date - interval '5 years'));
--
-- COMMIT;


-- ── VERIFY (run manually after UP, check constraint is present) ───────────────
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'camp_registrations'::regclass
--   AND contype = 'c'
-- ORDER BY conname;
