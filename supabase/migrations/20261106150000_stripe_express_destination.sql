-- Abrechnung B2: Stripe Connect Express-Konten fuer Vereine und Destination Charges
-- ueber die Plattform (on_behalf_of = Verein, application_fee_amount = Plattformgebuehr).
--
-- Rein additiv (keine Datenaenderung). Bestehende Standard-Konten (stripe_account_id,
-- Direct Charges) bleiben unveraendert nutzbar, bis ein Verein auf Express umgestellt ist.
-- Rollback:
--   drop index if exists public.uniq_organizations_stripe_express_account;
--   alter table public.organizations
--     drop column if exists stripe_express_account_id,
--     drop column if exists stripe_express_business_type,
--     drop column if exists stripe_express_charges_enabled,
--     drop column if exists stripe_express_payouts_enabled,
--     drop column if exists stripe_express_details_submitted,
--     drop column if exists stripe_express_requirements_due,
--     drop column if exists stripe_express_synced_at;
--   alter table public.camp_registrations
--     drop constraint if exists chk_camp_registrations_stripe_charge_type,
--     drop column if exists stripe_charge_type,
--     drop column if exists stripe_checkout_fee;
--
-- Rechte: keine neuen Spaltenrechte fuer anon/authenticated (Stripe-IDs nie ueber
-- PostgREST lesbar). Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.organizations add column if not exists stripe_express_account_id text;
alter table public.organizations add column if not exists stripe_express_business_type text;
alter table public.organizations add column if not exists stripe_express_charges_enabled boolean not null default false;
alter table public.organizations add column if not exists stripe_express_payouts_enabled boolean not null default false;
alter table public.organizations add column if not exists stripe_express_details_submitted boolean not null default false;
alter table public.organizations add column if not exists stripe_express_requirements_due integer not null default 0;
alter table public.organizations add column if not exists stripe_express_synced_at timestamptz;

alter table public.organizations drop constraint if exists chk_organizations_stripe_express;
alter table public.organizations
    add constraint chk_organizations_stripe_express check (
        (stripe_express_account_id is null or stripe_express_account_id ~ '^acct_[A-Za-z0-9]{8,}$')
        and (stripe_express_business_type is null or stripe_express_business_type in ('company', 'non_profit'))
        and stripe_express_requirements_due >= 0
    );

create unique index if not exists uniq_organizations_stripe_express_account
    on public.organizations (stripe_express_account_id)
    where stripe_express_account_id is not null;

comment on column public.organizations.stripe_express_account_id is
    'Stripe Connect Express-Konto des Vereins (Destination Charges ueber die Plattform). Getrennt von stripe_account_id (Alt: verbundenes Standard-Konto, Direct Charges).';

-- direct = Checkout auf dem verbundenen Standard-Konto (Alt), destination = Checkout auf
-- der Plattform mit transfer_data.destination. NULL bei Altdaten = direct.
alter table public.camp_registrations add column if not exists stripe_charge_type text;
alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination')
    );

-- Gebuehr, die beim Anlegen der Checkout-Session an Stripe gegeben wurde (Quelle fuer den
-- Snapshot beim Bezahlen, damit Snapshot und einbehaltener Betrag identisch sind).
alter table public.camp_registrations add column if not exists stripe_checkout_fee jsonb;

alter table public.organizations enable row level security;
revoke all on public.organizations from anon;

commit;
