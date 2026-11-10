-- ============================================================
-- CampsPilot SaaS: NUR STAGING. Zusammenfuehrung 10.11.2026 (zwei Migrationen).
-- Inhalt, unveraendert:
--   supabase/migrations/20261110100000_fee_rule_monthly_fee.sql        sha256 740c79b83db933af1ee9685c8b7c4f1697d189a9c18191de3b3ecc1cdacd1644
--   supabase/migrations/20261110110000_registration_self_service.sql   sha256 7ffe1b4af003f85917642dcbd6bd75cd2d3c590c4e64a8560a3f7edf67e10917
-- Voraussetzung: Staging hat alle Migrationen bis 20261107140000 (STAGING-MIGRATION-managed-risk.sql).
-- Rein additiv (nullable Spalten), wiederholbar. Reihenfolge: diese Datei -> Backend-Deploy.
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/golive/STAGING-MIGRATION-2026-11-10.sql
-- ============================================================

-- Preismodell: monatliche Grundgebuehr je Gebuehrenregel.
--
-- monthly_fee_cents NULL = Paketstandard (starter 0, verein 2490, individuell 0; aufgeloest in
-- backend_saas/app/fees.py). Reine Schema-Aenderung, keine Datenaenderung, kein Backup noetig.
-- Rollback:
--   alter table public.organization_fee_rules
--     drop constraint if exists chk_fee_rules_monthly_fee,
--     drop column if exists monthly_fee_cents;
--
-- Rechte: organization_fee_rules ist backend-only (RLS an, keine Policy, keine Rechte fuer
-- anon/authenticated; siehe 20261106140000). Die neue Spalte erbt das; das revoke unten
-- wiederholt es idempotent, damit die Spalte auch nach einem Tabellen-Grant nie lesbar ist.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.organization_fee_rules add column if not exists monthly_fee_cents integer;

alter table public.organization_fee_rules drop constraint if exists chk_fee_rules_monthly_fee;
alter table public.organization_fee_rules
    add constraint chk_fee_rules_monthly_fee check (monthly_fee_cents is null or monthly_fee_cents >= 0);

comment on column public.organization_fee_rules.monthly_fee_cents is
    'Grundgebuehr pro Monat in Cent (zzgl. USt). NULL = Paketstandard (starter 0, verein 2490, individuell 0).';

revoke all on public.organization_fee_rules from public, anon, authenticated;

commit;

-- "Meine Buchung" und Erinnerungsmail (Plan 2026-11-10, Abschnitt B).
--
-- cancellation_requested_at: Eltern haben ueber den Link "Meine Buchung" eine Stornierung
--   angefragt. Storniert wird nicht automatisch, das entscheidet der Verein.
-- reminder_sent_at: die Erinnerungsmail drei Tage vor Campbeginn ist verschickt (genau einmal).
--
-- Rein additiv, keine Datenaenderung, kein Backfill. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Rollback:
--   alter table public.camp_registrations
--       drop column if exists cancellation_requested_at, drop column if exists reminder_sent_at;
-- Rechte: beide Spalten sind Backend-Spalten, kein Leserecht fuer authenticated
-- (Spaltenrechte siehe 20261106160000; neue Spalten bekommen dort kein SELECT).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations
    add column if not exists cancellation_requested_at timestamptz,
    add column if not exists reminder_sent_at timestamptz;

comment on column public.camp_registrations.cancellation_requested_at is
    'Zeitpunkt, an dem die Eltern ueber "Meine Buchung" eine Stornierung angefragt haben. Nur Anfrage: der Status bleibt unveraendert, bis der Verein storniert.';
comment on column public.camp_registrations.reminder_sent_at is
    'Zeitpunkt der Erinnerungsmail drei Tage vor Campbeginn. Gesetzt = nicht noch einmal senden.';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (cancellation_requested_at, reminder_sent_at) on public.camp_registrations from authenticated;

commit;
