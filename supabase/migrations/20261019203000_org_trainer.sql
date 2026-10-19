-- L1e: Trainer-Sektion — zwei nullable Spalten für Trainer-Bild und -Text.
-- Keine RLS-Änderung nötig: bestehende s3_organization_read-Policy greift
-- auf die gesamte Tabelle (kein Column-Level-Grant); Backend-Verbindungen
-- nutzen BYPASSRLS (service-role key), RLS betrifft sie nicht.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS trainer_image_url text,
    ADD COLUMN IF NOT EXISTS trainer_text text;
