-- ============================================================
-- Phase 2 Migration: Bilderrechte, Zahlungsdatum, payment_status-Erweiterung
-- Im Supabase SQL Editor ausführen (einmalig)
-- ============================================================

-- 1. Bilderrechte-Feld
--    Standard: false (= Nein). Bestehende Zeilen bekommen automatisch false.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS photo_permission boolean NOT NULL DEFAULT false;

-- 2. Zahlungsdatum
--    Wird gesetzt, wenn Admin "Als bezahlt markieren" klickt.
--    NULL = noch nie als bezahlt markiert.
--    Wird geleert, wenn Zahlung auf "offen" zurückgesetzt wird.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 3. payment_status: 'cancelled' als zulässigen Wert ergänzen
--    Bestehende Werte (open, paid, refunded, waived) bleiben erhalten.
ALTER TABLE camp_registrations
  DROP CONSTRAINT IF EXISTS chk_payment_status_allowed;

ALTER TABLE camp_registrations
  ADD CONSTRAINT chk_payment_status_allowed
  CHECK (payment_status IN ('open', 'paid', 'refunded', 'waived', 'cancelled'));
