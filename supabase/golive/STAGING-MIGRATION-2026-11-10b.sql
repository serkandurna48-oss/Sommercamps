-- ============================================================
-- CampsPilot SaaS: NUR STAGING. Selbststorno (eine Migration), 10.11.2026.
-- Inhalt, unveraendert: supabase/migrations/20261110120000_parent_self_cancel.sql  sha256 7682fb3f70c2852eb2056618f43fbce728800cd1154947e3ae97d02c5f1c9eab
-- Voraussetzung: STAGING-MIGRATION-2026-11-10.sql ist angewendet. Additiv, wiederholbar. Vor dem Backend-Deploy.
-- ============================================================

-- Selbststorno durch Eltern ("Meine Buchung"): Erstattung und Stornierung in einem Schritt.
--
-- parent_cancel_started_at: Die Eltern haben die Stornierung ausgeloest; gesetzt, BEVOR die
--   Erstattung bei Stripe angelegt wird. Ist es gesetzt, die Buchung aber nicht storniert, wurde
--   moeglicherweise schon erstattet: ein Retry storniert dann nur noch und erstattet nicht erneut.
-- parent_cancelled_at: Die Eltern haben selbst storniert (Storno committed, in derselben
--   Transaktion wie der Statuswechsel gesetzt). Basis fuer den Chip "Von Eltern storniert".
--
-- Rein additiv, keine Datenaenderung, kein Backfill. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Rollback:
--   alter table public.camp_registrations
--       drop column if exists parent_cancel_started_at, drop column if exists parent_cancelled_at;
-- Rechte: Backend-Spalten, kein Leserecht fuer authenticated (wie 20261110110000).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations
    add column if not exists parent_cancel_started_at timestamptz,
    add column if not exists parent_cancelled_at timestamptz;

comment on column public.camp_registrations.parent_cancel_started_at is
    'Eltern haben ueber "Meine Buchung" die Stornierung ausgeloest (gesetzt vor der Stripe-Erstattung). Gesetzt und nicht storniert = Erstattung evtl. schon erfolgt, nur noch stornieren.';
comment on column public.camp_registrations.parent_cancelled_at is
    'Zeitpunkt, an dem die Eltern ihre Anmeldung selbst storniert haben (gleiche Transaktion wie der Statuswechsel).';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (parent_cancel_started_at, parent_cancelled_at) on public.camp_registrations from authenticated;

commit;
