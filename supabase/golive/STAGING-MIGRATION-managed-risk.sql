-- ============================================================
-- CampsPilot SaaS: NUR STAGING. Stripe Managed Risk (eine Migration).
-- Inhalt: supabase/migrations/20261107140000_stripe_managed_risk.sql, unveraendert.
-- sha256 bcec3eb29392992a9270ebb43eca9ba3f3754ec2432a4c7b8c4637a38548e47d
-- Fuer Staging, das schon alle Migrationen bis 20261107130000 hat. Prod nutzt
-- PROD-MIGRATION-2026-11.sql (enthaelt diese Datei als [15/15]).
-- Voraussetzung: 20261106150000_stripe_express_destination.sql ist angewendet
--   (select count(*) from information_schema.columns where table_name='organizations'
--    and column_name='stripe_express_account_id'; muss 1 sein).
-- Aendert Daten nur fuer vorhandene Express-Konten (Kontoart destination) -> vorher Backup.
-- Reihenfolge: diese Datei -> Backend. Wiederholbar (idempotent).
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/golive/STAGING-MIGRATION-managed-risk.sql
-- ============================================================

-- Online-Zahlung mit Stripe Managed Risk: Vereinskonten werden als Accounts v2 angelegt
-- (losses_collector = stripe, fees_collector = stripe, volles Stripe-Dashboard). Zahlungen
-- laufen als Direct Charges auf dem Vereinskonto mit application_fee_amount (Plattformgebuehr).
--
-- organizations.stripe_express_account_kind: welcher Zahlungsweg zum Konto in
-- stripe_express_account_id gehoert.
--   destination = Express-Konto aus B2 (Destination Charges ueber die Plattform, nur Staging)
--   direct_fee  = Accounts-v2-Konto mit Managed Risk (Direct Charge + Plattformgebuehr)
-- NULL bei vorhandenem Konto wird im Code als destination behandelt (Altbestand).
-- camp_registrations.stripe_charge_type bekommt den Wert direct_fee.
--
-- Aendert Daten (Backfill der Kontoart fuer vorhandene Express-Konten) -> vorher Backup ziehen.
-- Rollback (erst, wenn kein Konto/keine Buchung direct_fee hat):
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
--   alter table public.camp_registrations add constraint chk_camp_registrations_stripe_charge_type
--     check (stripe_charge_type is null or stripe_charge_type in ('direct', 'destination'));
--   alter table public.organizations drop constraint if exists chk_organizations_stripe_express_kind,
--     drop column if exists stripe_express_account_kind;
-- Rechte: keine Spaltenrechte fuer anon/authenticated (Backend-only).
-- Release-Reihenfolge: diese Migration -> Backend (das Backend liest die Spalte bei jedem Checkout).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur fuer NULL.

begin;

set local lock_timeout = '5s';

alter table public.organizations add column if not exists stripe_express_account_kind text;

alter table public.organizations drop constraint if exists chk_organizations_stripe_express_kind;
alter table public.organizations
    add constraint chk_organizations_stripe_express_kind check (
        stripe_express_account_kind is null or stripe_express_account_kind in ('destination', 'direct_fee')
    );

-- Existing Express accounts were created for destination charges.
update public.organizations
   set stripe_express_account_kind = 'destination'
 where stripe_express_account_id is not null and stripe_express_account_kind is null;

comment on column public.organizations.stripe_express_account_kind is
    'Zahlungsweg des Kontos in stripe_express_account_id: direct_fee (Accounts v2, Managed Risk, Direct Charge + application_fee) oder destination (B2-Express, nur Staging). NULL mit Konto = destination.';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee')
    );

-- Backend-only column, even if column grants were handed out again. No-op when absent.
revoke select (stripe_express_account_kind) on public.organizations from anon, authenticated;

commit;
