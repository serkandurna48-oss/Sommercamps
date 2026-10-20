-- F1: Eigene Teilnahme- und Stornobedingungen je Anbieter.
-- Nullable, additiv, wiederholbar. Keine RLS-Änderung nötig: bestehende
-- s3_organization_read-Policy greift auf die gesamte Tabelle; Backend-
-- Verbindungen nutzen BYPASSRLS (service-role key).
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS terms_text text;
