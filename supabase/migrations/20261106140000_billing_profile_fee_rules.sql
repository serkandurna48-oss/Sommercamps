-- Abrechnung B1: Rechnungsstammdaten je Verein, Gebuehrenmodell mit Verlauf und
-- Gebuehren-Snapshot je bezahlter Buchung.
--
-- BACKUP-HINWEIS: Diese Migration aendert Daten (Backfill: jeder bestehende Verein ohne
-- Gebuehrenregel bekommt Paket "starter" 6,90 % gueltig ab 2000-01-01). Vor dem Lauf auf
-- einer echten Datenbank ein Backup ziehen. Rollback:
--   drop trigger if exists trg_organization_fee_rules_append_only on public.organization_fee_rules;
--   drop function if exists public.organization_fee_rules_append_only();
--   drop table if exists public.organization_fee_rules;
--   drop table if exists public.organization_billing_profiles;
--   alter table public.camp_registrations
--     drop column if exists fee_rule_id, drop column if exists fee_plan,
--     drop column if exists fee_percent, drop column if exists fee_fixed_cents,
--     drop column if exists fee_min_cents, drop column if exists fee_base_cents,
--     drop column if exists fee_cents, drop column if exists fee_collection,
--     drop column if exists fee_snapshot_at;
--
-- Rechte: alle neuen Tabellen sind backend-only (RLS an, keine Policy, keine Rechte fuer
-- anon/authenticated). Die neuen Spalten an camp_registrations bekommen keine
-- Spaltenrechte (20261024130000_column_level_grants.sql bleibt unveraendert).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur fuer Vereine ohne Regel.

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- Rechnungsstammdaten (Elternrechnung im Namen des Vereins)
-- ------------------------------------------------------------
create table if not exists public.organization_billing_profiles (
    organization_id        uuid        primary key
        references public.organizations (id) on delete cascade,
    legal_name             text        not null,
    street                 text        not null,
    postal_code            text        not null,
    city                   text        not null,
    tax_number             text,
    vat_id                 text,
    tax_status             text        not null,
    default_vat_rate       smallint,
    tax_exemption_text     text,
    invoice_number_prefix  text        not null,
    invoice_email          text        not null,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    -- Supabase user id of the last editor (text: audit value, no FK).
    updated_by             text
);

alter table public.organization_billing_profiles drop constraint if exists chk_billing_profiles_fields;
alter table public.organization_billing_profiles
    add constraint chk_billing_profiles_fields check (
        char_length(btrim(legal_name)) between 2 and 200
        and char_length(btrim(street)) between 3 and 200
        and postal_code ~ '^[0-9]{5}$'
        and char_length(btrim(city)) between 2 and 100
        and (tax_number is null or tax_number ~ '^[0-9][0-9 /]{8,18}[0-9]$')
        and (vat_id is null or vat_id ~ '^DE[0-9]{9}$')
        and invoice_number_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'
        and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        and char_length(invoice_email) <= 254
    );

alter table public.organization_billing_profiles drop constraint if exists chk_billing_profiles_tax;
alter table public.organization_billing_profiles
    add constraint chk_billing_profiles_tax check (
        (tax_status = 'ust_pflichtig'
            and coalesce(default_vat_rate, 0) in (7, 19)
            and tax_exemption_text is null
            and (tax_number is not null or vat_id is not null))
        or (tax_status = 'kleinunternehmer'
            and default_vat_rate is null
            and tax_exemption_text is null
            and (tax_number is not null or vat_id is not null))
        or (tax_status = 'steuerbefreit'
            and default_vat_rate is null
            and char_length(btrim(coalesce(tax_exemption_text, ''))) between 5 and 500)
    );

comment on table public.organization_billing_profiles is
    'Rechnungsstammdaten des Vereins (Absender der Elternrechnung). Pflege: Vereinsadmin und Platform-Owner (PUT /admin/organizations/{slug}/billing-profile).';

alter table public.organization_billing_profiles enable row level security;
revoke all on public.organization_billing_profiles from public, anon, authenticated;

-- ------------------------------------------------------------
-- Gebuehrenregeln (nur anfuegen; Verlauf = Aenderungsprotokoll)
-- ------------------------------------------------------------
create table if not exists public.organization_fee_rules (
    id               uuid          primary key default gen_random_uuid(),
    organization_id  uuid          not null
        references public.organizations (id) on delete cascade,
    plan             text          not null,
    percent          numeric(5,2)  not null,
    fixed_cents      integer,
    min_fee_cents    integer,
    valid_from       date          not null,
    note             text,
    created_at       timestamptz   not null default now(),
    -- Who added the rule (Supabase user id + email for a readable history; no FK so
    -- the history stays intact when an account is deleted). NULL = migration backfill.
    created_by       text,
    created_by_email text
);

alter table public.organization_fee_rules drop constraint if exists chk_fee_rules_values;
alter table public.organization_fee_rules
    add constraint chk_fee_rules_values check (
        plan in ('starter', 'verein', 'individuell')
        and percent >= 0 and percent <= 30
        and (fixed_cents is null or fixed_cents between 0 and 100000)
        and (min_fee_cents is null or min_fee_cents between 0 and 100000)
        and (note is null or char_length(note) <= 500)
        and (created_by is null or char_length(created_by) <= 64)
        and (created_by_email is null or char_length(created_by_email) <= 254)
    );

create index if not exists idx_fee_rules_org_valid_from
    on public.organization_fee_rules (organization_id, valid_from desc, created_at desc);

comment on table public.organization_fee_rules is
    'Plattformgebuehr je Verein mit Verlauf. Gueltig ist die Regel mit dem juengsten valid_from <= Buchungsdatum (bei gleichem Datum die zuletzt angelegte). Nur anfuegen; setzt nur der Platform-Owner.';

-- History rows are evidence for past fees: never update or delete them
-- (organization delete cascades are allowed via the FK).
create or replace function public.organization_fee_rules_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' and not exists (
        select 1 from public.organizations o where o.id = old.organization_id
    ) then
        return old;  -- cascade from a deleted organization
    end if;
    raise exception 'organization_fee_rules is append-only';
end
$$;

revoke all on function public.organization_fee_rules_append_only() from public, anon, authenticated;

drop trigger if exists trg_organization_fee_rules_append_only on public.organization_fee_rules;
create trigger trg_organization_fee_rules_append_only
    before update or delete on public.organization_fee_rules
    for each row execute function public.organization_fee_rules_append_only();

alter table public.organization_fee_rules enable row level security;
revoke all on public.organization_fee_rules from public, anon, authenticated;

-- Backfill: bestehende Vereine ohne Regel -> Paket starter (6,90 %).
insert into public.organization_fee_rules (organization_id, plan, percent, valid_from, note)
select o.id, 'starter', 6.90, date '2000-01-01', 'Backfill: Standardpaket Starter'
from public.organizations o
where not exists (select 1 from public.organization_fee_rules r where r.organization_id = o.id);

-- ------------------------------------------------------------
-- Gebuehren-Snapshot je bezahlter Buchung
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists fee_rule_id uuid;
alter table public.camp_registrations add column if not exists fee_plan text;
alter table public.camp_registrations add column if not exists fee_percent numeric(5,2);
alter table public.camp_registrations add column if not exists fee_fixed_cents integer;
alter table public.camp_registrations add column if not exists fee_min_cents integer;
alter table public.camp_registrations add column if not exists fee_base_cents integer;
alter table public.camp_registrations add column if not exists fee_cents integer;
alter table public.camp_registrations add column if not exists fee_collection text;
alter table public.camp_registrations add column if not exists fee_snapshot_at timestamptz;

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
            and coalesce(fee_collection, '') in ('application_fee', 'not_collected'))
    );

comment on column public.camp_registrations.fee_collection is
    'application_fee = per Stripe Destination Charge einbehalten; not_collected = berechnet, aber nicht einbehalten (Ueberweisung/bar oder Altkonto mit Direct Charges).';

commit;
