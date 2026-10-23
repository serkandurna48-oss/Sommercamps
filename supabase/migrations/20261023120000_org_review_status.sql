-- Zweck: S1 Selbstregistrierung — Prüfstatus für Vereine. Neue Vereine starten
-- im Entwurfsstatus (review_status='draft') und werden nach Prüfung durch den
-- Platform-Owner auf 'approved' gesetzt. Erst dann sind sie öffentlich sichtbar
-- (zusammen mit site_published=true und plan_status in ('pilot','active')).
-- Bestehende Zeilen erhalten review_status='approved' per DB-Default, bleiben
-- damit unverändert öffentlich — keine Regression.
--
-- Anwendungsbefehl (auszuführen durch den Menschen):
--   supabase db push
-- oder manuell per psycopg2-Skript gegen DATABASE_URL (wie Migration
-- 20260923190000). Die `add column if not exists`-Guards machen einen zweiten
-- Lauf technisch unschädlich (No-Op).
--
-- Auswirkungen:
--   - Rein additiv; keine bestehende Zeile/Spalte wird geändert oder gelöscht.
--   - Bestehende Vereine erhalten review_status='approved' (DB-Default), bleiben
--     damit öffentlich sichtbar — keine Regression.
--   - Neue, über POST /public/signup angelegte Vereine starten mit
--     review_status='draft', site_published=false und sind nicht öffentlich
--     sichtbar, bis ein Platform-Owner sie auf 'approved' setzt.
--   - Weder KSV Baunatal (backend/) noch JK Performance Academy
--     (backend_saas-Schwester unter JK-102) sind betroffen — diese Migration
--     läuft ausschließlich gegen das CampsPilot-SaaS-Projekt.

alter table public.organizations
    add column if not exists review_status text not null default 'approved'
        check (review_status in ('draft', 'submitted', 'approved', 'rejected')),
    add column if not exists avv_accepted_at timestamptz,
    add column if not exists avv_version text,
    add column if not exists submitted_at timestamptz,
    add column if not exists approved_at timestamptz,
    add column if not exists approved_by uuid references auth.users(id) on delete set null,
    add column if not exists review_note text;

comment on column public.organizations.review_status is 'Prüfstatus: draft (neu, wartet auf Einreichung), submitted (eingereicht, wartet auf Platform-Owner-Entscheid), approved (freigegeben, öffentlich sichtbar wenn site_published=true), rejected (abgelehnt, kann erneut eingereicht werden). Bestehende Zeilen erhalten approved per DEFAULT.';
comment on column public.organizations.avv_accepted_at is 'Zeitpunkt der Auftragsverarbeitungsvertrag-Bestätigung (Server-Zeit, nie vom Client). Gesetzt beim ersten submit-review-Aufruf.';
comment on column public.organizations.avv_version is 'Version des bestätigten AVV-Textes.';
comment on column public.organizations.submitted_at is 'Zeitpunkt der Einreichung zur Prüfung (Server-Zeit).';
comment on column public.organizations.approved_at is 'Zeitpunkt der Freigabe durch den Platform-Owner (Server-Zeit).';
comment on column public.organizations.approved_by is 'Supabase-Auth-User-ID des Platform-Owners, der die Freigabe erteilt hat.';
comment on column public.organizations.review_note is 'Pflichtfeld beim Ablehnen (review_status=rejected): Begründung für die Ablehnung. Hilft dem Verein, den Antrag zu korrigieren.';
