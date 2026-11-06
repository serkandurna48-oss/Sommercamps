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
