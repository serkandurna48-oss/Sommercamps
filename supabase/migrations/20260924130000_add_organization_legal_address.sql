-- Zweck: MVP-Oberflächenauftrag, Blocker "Impressum/Datenschutz sind
-- hart auf KSV Baunatal verdrahtet" — jeder Verein auf der Plattform
-- verlinkte bisher (frontend/app/pilot/[org]/ParentFlow.tsx) auf die
-- globalen, wirklich fest mit KSV-Rechtsdaten codierten Seiten
-- /impressum und /datenschutz. Ein zweiter Verein zeigte seinen Eltern
-- damit fälschlich KSV's Name/Adresse. Diese Migration liefert das
-- fehlende Datenfeld für eine pro-Verein-Lösung (neue Seiten unter
-- /pilot/[org]/impressum bzw. /datenschutz, siehe dortige page.tsx) —
-- kein erfundener Rechtstext, nur das Datenmodell dafür.
--
-- contact_person_name (schon vorhanden, Migration 20260923190000) deckt
-- "Vertreten durch" ab; legal_name (schon vorhanden, Migration
-- 20260917133748) deckt den rechtlichen Namen ab. Es fehlte bisher nur
-- eine Anschrift — ohne die ist ein Impressum nicht vollständig, egal
-- wie viele andere Felder gepflegt sind.
--
-- Anwendungsstatus: gegen die Cloud-DB (CampsPilot SaaS, Ref
-- wkmckfbzhmihyfwiekct) angewendet — per einmaligem psycopg2-Skript
-- gegen DATABASE_URL, wie schon 20260923190000/20260923220000 in diesem
-- Verzeichnis (Supabase-CLI in dieser Umgebung nicht installiert). Rein
-- additiv, nullable — keine bestehende Organisation verändert. Für ein
-- zukünftiges zweites Environment ist `supabase db push` (nach `supabase
-- link --project-ref wkmckfbzhmihyfwiekct`) der korrekte Weg.
-- Rein additiv, nullable, kein Platzhaltertext — erscheint auf den neuen
-- Rechtsseiten nur, wenn der Verein sie tatsächlich über die Einrichtung
-- selbst eingetragen hat (siehe OrganizationConfigForm.tsx).

alter table public.organizations
    add column if not exists legal_address text;

comment on column public.organizations.legal_address is 'Vollständige Anschrift für Impressum/Datenschutz dieses Vereins (Straße, PLZ, Ort — mehrzeilig). NULL = auf /pilot/{org}/impressum bzw. /datenschutz erscheint ein ehrlicher "noch nicht angegeben"-Hinweis, NIE ein Fallback auf einen anderen Verein.';
