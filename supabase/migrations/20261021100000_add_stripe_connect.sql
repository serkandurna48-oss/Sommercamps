-- UC1: Stripe Connect – Direktzahlung an Vereinskonten.
-- Additiv, wiederholbar. Keine RLS-Änderung nötig: das Backend nutzt
-- BYPASSRLS (Service-Role-Key); stripe_account_id ist nie in einer
-- öffentlichen Antwort deklariert (schemas.py / admin_schemas.py).
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS stripe_account_id       text,
    ADD COLUMN IF NOT EXISTS stripe_charges_enabled  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS online_payment_enabled  boolean NOT NULL DEFAULT false;

ALTER TABLE public.camp_registrations
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id  text,
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id    text;
