-- Phase 3: Stripe Checkout
-- Stellt sicher, dass stripe_session_id existiert (für DBs, die vor dem Schema-Update angelegt wurden).
-- registration_token war bereits in Phase 1 enthalten – kein erneutes ALTER nötig.

ALTER TABLE camp_registrations
    ADD COLUMN IF NOT EXISTS stripe_session_id text;

-- Unique-Index nur anlegen, wenn er noch nicht existiert
CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_reg_stripe_session_id
    ON camp_registrations (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;
