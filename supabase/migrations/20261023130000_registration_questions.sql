-- KV1: Zusatzfragen bei der Anmeldung (verein-konfigurierbare Fragen,
-- max. 5, Typen 'choice'/'text') und Antworten je Anmeldung.
-- Additiv, idempotent, keine RLS-Änderung nötig: bestehende
-- s3_organization_read-Policy greift auf die gesamte Tabelle; Backend-
-- Verbindungen nutzen BYPASSRLS (service-role key).
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS registration_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.camp_registrations
    ADD COLUMN IF NOT EXISTS extra_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
