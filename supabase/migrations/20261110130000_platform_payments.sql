-- Plattform-Zahlung (Entscheidung Serkan 10.11.2026): kein Verein richtet Online-Zahlung selbst ein.
-- Eltern zahlen per Stripe Checkout auf dem Stripe-Konto der Plattform (kein Connect-Konto des
-- Vereins); die Plattform behaelt ihre Gebuehr und ueberweist den Rest ausserhalb des Systems an
-- den Verein (Auszahlungsliste im Owner-Bereich).
--
-- 1. camp_registrations.stripe_charge_type bekommt den Wert 'platform'.
-- 2. camp_registrations.fee_collection bekommt den Wert 'platform_collected' (Gebuehr bleibt bei
--    der Plattform, weil sie das Geld selbst einzieht).
-- 3. Neue Tabelle organization_payouts: je Verein und Monat ein Eintrag "ueberwiesen"
--    (Betrag, Datum, Verwendungszweck/Referenz). Backend-only.
--
-- Rein additiv (erweiterte CHECKs, neue Tabelle), keine Datenaenderung. Idempotent.
-- Rollback (erst, wenn keine Buchung platform/platform_collected hat):
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
--   alter table public.camp_registrations add constraint chk_camp_registrations_stripe_charge_type
--     check (stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee'));
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_fee_snapshot;
--   alter table public.camp_registrations add constraint chk_camp_registrations_fee_snapshot check (
--     (fee_snapshot_at is null and fee_cents is null and fee_collection is null)
--     or (fee_snapshot_at is not null and coalesce(fee_plan, '') in ('starter', 'verein', 'individuell')
--         and coalesce(fee_percent between 0 and 30, false) and coalesce(fee_base_cents >= 0, false)
--         and coalesce(fee_cents between 0 and fee_base_cents, false)
--         and coalesce(fee_collection, '') in ('application_fee', 'not_collected')));
--   drop table if exists public.organization_payouts;
-- Rechte: organization_payouts ist backend-only (RLS an, keine Policy, alle Rechte entzogen).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee', 'platform')
    );

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_fee_snapshot;
alter table public.camp_registrations
    add constraint chk_camp_registrations_fee_snapshot check (
        (fee_snapshot_at is null and fee_cents is null and fee_collection is null)
        -- coalesce: a NULL inside a CHECK would otherwise pass silently.
        or (fee_snapshot_at is not null
            and coalesce(fee_plan, '') in ('starter', 'verein', 'individuell')
            and coalesce(fee_percent between 0 and 30, false)
            and coalesce(fee_base_cents >= 0, false)
            and coalesce(fee_cents between 0 and fee_base_cents, false)
            and coalesce(fee_collection, '') in ('application_fee', 'not_collected', 'platform_collected'))
    );

comment on column public.camp_registrations.fee_collection is
    'application_fee = per Stripe Application Fee einbehalten; platform_collected = Zahlung lief ueber das Plattformkonto, Gebuehr bleibt bei der Plattform; not_collected = berechnet, aber nicht einbehalten (Ueberweisung/bar oder Altkonto mit Direct Charges).';

create table if not exists public.organization_payouts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    month date not null,
    payout_cents integer not null,
    paid_at date not null,
    reference text not null,
    created_at timestamptz not null default now(),
    constraint uq_organization_payouts_org_month unique (organization_id, month),
    constraint chk_organization_payouts_month_first check (month = date_trunc('month', month)::date),
    constraint chk_organization_payouts_reference check (length(reference) between 1 and 140)
);

comment on table public.organization_payouts is
    'Auszahlung der Plattform-Zahlungen eines Monats an den Verein (Ueberweisung ausserhalb des Systems). Ein Eintrag je Verein und Monat.';

alter table public.organization_payouts enable row level security;
revoke all on public.organization_payouts from public, anon, authenticated;

commit;
