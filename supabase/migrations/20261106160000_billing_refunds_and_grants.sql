-- Abrechnung B2, Fix-Runde 1: Erstattungen in den Gebuehrendaten und Spaltenrechte.
--
-- 1. payment_status bekommt 'partially_refunded' (Teilerstattung einer Online-Zahlung).
-- 2. camp_registrations: refunded_cents (erstatteter Betrag), fee_refunded_cents (von
--    Stripe zurueckgegebene bzw. nicht mehr geschuldete Plattformgebuehr), refunded_at.
--    Netto-Gebuehr je Buchung = fee_cents - coalesce(fee_refunded_cents, 0).
-- 3. Spaltenrechte: 20261018154831_tenant_read_policies.sql gibt authenticated
--    tabellenweites SELECT auf camp_registrations (RLS: eigene Org). Gebuehren- und
--    Stripe-Spalten sind intern (Gebuehrenregel, Stripe-IDs). Wie bei organizations
--    (20261024130000_column_level_grants.sql): Tabellenrecht entziehen, alle uebrigen
--    Spalten einzeln wieder freigeben. Neue Spalten sind damit kuenftig standardmaessig
--    NICHT ueber PostgREST lesbar (das Frontend liest Anmeldungen nur ueber FastAPI).
--
-- Rein additiv bis auf den erweiterten CHECK (keine Datenaenderung). Rollback:
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_status;
--   alter table public.camp_registrations add constraint chk_camp_registrations_payment_status
--     check (payment_status in ('open', 'paid', 'refunded', 'waived', 'cancelled'));
--     (vorher partially_refunded-Zeilen auf 'paid' setzen)
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_refunds,
--     drop column if exists refunded_cents, drop column if exists fee_refunded_cents,
--     drop column if exists refunded_at;
--   grant select on public.camp_registrations to authenticated;
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Grants per DO-Block neu gesetzt.

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_status;
alter table public.camp_registrations
    add constraint chk_camp_registrations_payment_status
    check (payment_status in ('open', 'paid', 'partially_refunded', 'refunded', 'waived', 'cancelled'));

alter table public.camp_registrations add column if not exists refunded_cents integer;
alter table public.camp_registrations add column if not exists fee_refunded_cents integer;
alter table public.camp_registrations add column if not exists refunded_at timestamptz;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_refunds;
alter table public.camp_registrations
    add constraint chk_camp_registrations_refunds check (
        (refunded_cents is null or refunded_cents >= 0)
        and (fee_refunded_cents is null
             or (fee_refunded_cents >= 0 and fee_refunded_cents <= coalesce(fee_cents, 0)))
    );

comment on column public.camp_registrations.fee_refunded_cents is
    'Plattformgebuehr, die durch Erstattung zurueckging (Stripe ApplicationFee.amount_refunded) bzw. bei manueller Erstattung nicht mehr geschuldet ist. Netto = fee_cents - fee_refunded_cents.';

-- Column-level read rights for authenticated (see header, point 3).
revoke select on public.camp_registrations from authenticated;
do $$
declare
    readable text;
begin
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into readable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'camp_registrations'
       and column_name not like 'fee\_%'
       and column_name not like 'stripe\_%'
       and column_name not in ('refunded_cents', 'refunded_at');
    execute format('grant select (%s) on public.camp_registrations to authenticated', readable);
end
$$;

commit;
