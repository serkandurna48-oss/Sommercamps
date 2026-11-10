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
