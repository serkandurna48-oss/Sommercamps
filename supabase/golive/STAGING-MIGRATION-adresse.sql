-- ============================================================
-- CampsPilot SaaS: NUR STAGING. Rechnungsanschrift (eine Migration).
-- Inhalt: supabase/migrations/20261107130000_parent_billing_address.sql, unveraendert.
-- sha256 18f4765bf61b27f7a7ca08901816f8df51a04e06e275f36c6b1d3f752b108abc
-- Fuer Staging, das schon alle Migrationen bis 20261107120000 hat. Prod nutzt
-- PROD-MIGRATION-2026-11.sql (enthaelt diese Datei als [14/14]).
-- Voraussetzung pruefen: select has_table_privilege('authenticated','public.camp_registrations','SELECT');
--   muss f sein (20261106160000 angewendet), sonst wirkt das Spalten-REVOKE nicht.
-- Reihenfolge: diese Datei -> Backend -> Frontend. Wiederholbar (idempotent).
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/golive/STAGING-MIGRATION-adresse.sql
-- ============================================================

-- Rechnungsanschrift der Eltern (Pflicht bei kostenpflichtigen Buchungen, vollstaendige
-- Rechnung nach § 14 UStG bzw. § 34a UStDV fuer Kleinbetragsrechnungen).
--
-- camp_registrations bekommt parent_street, parent_postal_code, parent_city (alle nullable:
-- kostenlose Buchungen und Altbestand haben keine Anschrift). Pflicht bei Preis > 0 prueft
-- das Backend (RegistrationCreate + Repository), die Datenbank prueft nur Laenge/Format.
-- Bestehende Rechnungen bleiben unveraendert (Snapshot in invoices.data).
--
-- Rein additiv, keine Datenaenderung. Rollback:
--   alter table public.camp_registrations
--     drop constraint if exists chk_camp_registrations_parent_address,
--     drop column if exists parent_street, drop column if exists parent_postal_code,
--     drop column if exists parent_city;
-- Rechte: kein Spaltenrecht fuer authenticated (siehe 20261106160000).
-- Voraussetzung: 20261106160000 ist angewendet (Tabellen-SELECT fuer authenticated entzogen).
-- Solange das Tabellenrecht noch besteht, hat das Spalten-REVOKE unten keine Wirkung.
-- Release-Reihenfolge: diese Migration -> Backend -> Frontend (das Backend liest die Spalten
-- in jeder Buchung; ohne Migration scheitert jede Anmeldung mit 500).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations add column if not exists parent_street text;
alter table public.camp_registrations add column if not exists parent_postal_code text;
alter table public.camp_registrations add column if not exists parent_city text;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_parent_address;
alter table public.camp_registrations
    add constraint chk_camp_registrations_parent_address check (
        (parent_street is null or char_length(btrim(parent_street)) between 1 and 120)
        and (parent_city is null or char_length(btrim(parent_city)) between 1 and 80)
        and (parent_postal_code is null
             or (char_length(parent_postal_code) between 4 and 10
                 and parent_postal_code ~ '^[0-9A-Za-z][0-9A-Za-z -]*[0-9A-Za-z]$'))
    );

comment on column public.camp_registrations.parent_street is
    'Rechnungsanschrift: Strasse und Hausnummer. Zweck Rechnungsstellung; Aufbewahrung wie Rechnungen.';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (parent_street, parent_postal_code, parent_city)
    on public.camp_registrations from authenticated;

commit;
