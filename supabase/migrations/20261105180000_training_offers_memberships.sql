-- Einzel-/Kleingruppentraining: Angebote, Mitgliedschaften, Preis-Felder.
-- A training session is a `camps` row with offer_id set; every training rule is
-- bound to offer_id IS NOT NULL, so classic camps are unaffected.
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS guards).
-- Datenschutz: organization_memberships speichert Vor-/Nachname und Geburtsdatum
-- von Vereinsmitgliedern (Kinderdaten) -> Datenschutzerklärung/AVV prüfen.
-- Nur das Backend liest diese Tabelle (RLS an, keine Policy, kein Grant).

-- ------------------------------------------------------------
-- training_offers
-- ------------------------------------------------------------
create table if not exists public.training_offers (
    id                      uuid        primary key default gen_random_uuid(),
    organization_id         uuid        not null
        references public.organizations (id) on delete restrict,
    slug                    text        not null,
    title                   text        not null,
    kind                    text        not null,
    description             text,
    duration_minutes        integer     not null,
    location                text,
    price_member_cents      integer     not null,
    price_nonmember_cents   integer     not null,
    status                  text        not null default 'draft',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint training_offers_organization_id_slug_key unique (organization_id, slug),
    -- Target of the composite FK from camps (tenant-safe reference).
    constraint training_offers_id_organization_id_key unique (id, organization_id),
    constraint chk_training_offers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    constraint chk_training_offers_title_not_blank check (trim(title) <> ''),
    constraint chk_training_offers_kind check (kind in ('einzel', 'gruppe')),
    constraint chk_training_offers_duration check (duration_minutes > 0),
    constraint chk_training_offers_price_member check (price_member_cents >= 0),
    constraint chk_training_offers_price_nonmember check (price_nonmember_cents >= 0),
    constraint chk_training_offers_status check (status in ('draft', 'published', 'archived'))
);

drop trigger if exists set_updated_at on public.training_offers;
create trigger set_updated_at
    before update on public.training_offers
    for each row
    execute function public.set_updated_at();

alter table public.training_offers enable row level security;
grant select on public.training_offers to authenticated;

drop policy if exists s3_training_offer_read on public.training_offers;
create policy s3_training_offer_read on public.training_offers
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
        or organization_id in (select organization_id from public.organization_members
                               where user_id = (select auth.uid()) and role = 'org_admin')
    );

-- ------------------------------------------------------------
-- camps: training sessions
-- ------------------------------------------------------------
alter table public.camps add column if not exists offer_id uuid;
alter table public.camps add column if not exists starts_at timestamptz;
alter table public.camps add column if not exists ends_at timestamptz;
-- Member price frozen per session (price_cents holds the non-member price).
alter table public.camps add column if not exists price_member_cents integer;

alter table public.camps drop constraint if exists camps_offer_org_fk;
alter table public.camps add constraint camps_offer_org_fk
    foreign key (offer_id, organization_id)
    references public.training_offers (id, organization_id) on delete restrict;

alter table public.camps drop constraint if exists chk_camps_training_times;
alter table public.camps add constraint chk_camps_training_times check (
    offer_id is null
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
);

alter table public.camps drop constraint if exists chk_camps_price_member_cents;
alter table public.camps add constraint chk_camps_price_member_cents
    check (price_member_cents is null or price_member_cents >= 0);

create index if not exists idx_camps_offer on public.camps (organization_id, offer_id)
    where offer_id is not null;

-- ------------------------------------------------------------
-- organization_memberships (backend access only)
-- ------------------------------------------------------------
create table if not exists public.organization_memberships (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    first_name          text        not null,
    last_name           text        not null,
    birth_date          date        not null,
    member_number       text,
    active              boolean     not null default true,
    source              text        not null,
    match_key           text        not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint organization_memberships_match_unique
        unique (organization_id, match_key, birth_date),
    constraint chk_organization_memberships_source check (source in ('csv', 'manual')),
    constraint chk_organization_memberships_names
        check (trim(first_name) <> '' and trim(last_name) <> '')
);

drop trigger if exists set_updated_at on public.organization_memberships;
create trigger set_updated_at
    before update on public.organization_memberships
    for each row
    execute function public.set_updated_at();

alter table public.organization_memberships enable row level security;
-- No policy and no grant: not readable via PostgREST by anon/authenticated.
revoke all on public.organization_memberships from anon, authenticated;

-- ------------------------------------------------------------
-- camp_registrations: price at booking time
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists applied_price_cents integer;
alter table public.camp_registrations add column if not exists member_match boolean;
alter table public.camp_registrations add column if not exists payment_method text;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_applied_price;
alter table public.camp_registrations add constraint chk_camp_registrations_applied_price
    check (applied_price_cents is null or applied_price_cents >= 0);

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_method;
alter table public.camp_registrations add constraint chk_camp_registrations_payment_method
    check (payment_method is null or payment_method in ('online', 'ueberweisung', 'bar'));
