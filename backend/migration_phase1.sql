-- ============================================================
-- Phase 1 Migration: registration_token, email_sent_at, stripe_session_id
-- Einmalig im Supabase SQL Editor ausführen.
-- Bestehende Daten werden nicht gelöscht oder überschrieben.
-- ============================================================

-- Öffentliches Token für Payment-Links und E-Mail-Bestätigungen.
-- Trennt interne id von öffentlich genutzten Identifikatoren.
-- gen_random_uuid() füllt bestehende Zeilen automatisch.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS registration_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Einmalig UNIQUE-Index anlegen (IF NOT EXISTS verhindert Fehler bei Mehrfachausführung)
CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_reg_registration_token
  ON camp_registrations (registration_token);

-- Zeitstempel, wann die Bestätigungsmail gesendet wurde.
-- NULL = noch nicht gesendet. Verhindert doppelten Mailversand in Phase 2.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Stripe Checkout Session ID (z.B. cs_live_...).
-- Wird in Phase 3 beim Erstellen der Checkout-Session gesetzt.
-- UNIQUE stellt sicher, dass keine Session zwei Registrierungen zugeordnet wird.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_reg_stripe_session_id
  ON camp_registrations (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
