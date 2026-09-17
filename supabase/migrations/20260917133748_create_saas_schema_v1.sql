-- ============================================================
-- CampsPilot SaaS — Schema v1 (CP-S402)
-- Shared-Schema Multi-Tenant Fundament: organizations, camps, camp_registrations.
--
-- Scope: brand-new, isolated SaaS Supabase project. Has no relation to the
-- KSV Baunatal legacy database (backend/schema.sql) — no data, tables, or
-- naming are shared. See docs/saas/architecture.md and
-- docs/saas/database-schema.md for the full design rationale.
--
-- Convention: unlike the legacy backend/*.sql files (written for repeated,
-- manual execution in the Supabase SQL Editor, hence their "IF NOT EXISTS"
-- guards), this migration is tracked by the Supabase CLI migration history
-- and is only ever applied once per environment — no IF NOT EXISTS needed.
-- ============================================================


-- ------------------------------------------------------------
-- Trigger function: keep updated_at current on every UPDATE.
-- SECURITY INVOKER (default, not declared SECURITY DEFINER) — it only ever
-- writes to NEW of the row already being written by the calling statement,
-- so it needs no elevated privileges. search_path is pinned to '' so name
-- resolution can't be hijacked by a malicious schema earlier in a caller's
-- search_path; now() resolves via pg_catalog, which Postgres always
-- searches implicitly regardless of search_path.
-- ------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ============================================================
-- organizations — one row per tenant (club, academy, ...)
-- ============================================================

create table public.organizations (
    id              uuid        primary key default gen_random_uuid(),

    slug            text        not null,
    name            text        not null,
    legal_name      text,
    contact_email   text        not null,
    contact_phone   text,
    logo_url        text,
    primary_color   text,

    -- Controlled set for MVP. No Stripe billing model yet (CP-S402 scope).
    plan_status     text        not null default 'pilot',

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint organizations_slug_key unique (slug),

    constraint chk_organizations_slug_not_blank check (trim(slug) <> ''),
    -- Lowercase, hyphen-separated — slug is a future URL path segment
    -- (`/[org-slug]/...`, see architecture.md), not free text.
    constraint chk_organizations_slug_format
        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    constraint chk_organizations_name_not_blank check (trim(name) <> ''),
    constraint chk_organizations_contact_email_format
        check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint chk_organizations_primary_color_format
        check (primary_color is null or primary_color ~* '^#[0-9a-f]{6}$'),
    constraint chk_organizations_plan_status
        check (plan_status in ('pilot', 'active', 'suspended', 'cancelled'))
);

comment on table public.organizations is
    'CampsPilot SaaS tenants. One row per club/academy. Root of all tenant-scoped data.';

create trigger set_updated_at
    before update on public.organizations
    for each row
    execute function public.set_updated_at();


-- ============================================================
-- camps — a bookable offering that belongs to exactly one organization
-- ============================================================

create table public.camps (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,

    slug                text        not null,
    title               text        not null,

    start_date          date        not null,
    end_date            date        not null,
    registration_start  timestamptz,
    registration_end    timestamptz,

    age_min             integer     not null,
    age_max             integer     not null,
    capacity            integer     not null,

    price_cents         integer     not null,
    currency            text        not null default 'EUR',

    -- Controlled set for MVP. Governs visibility in a future frontend.
    status              text        not null default 'draft',

    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Unique per organization, NOT globally — matches architecture.md 4.2.
    constraint camps_organization_id_slug_key unique (organization_id, slug),

    -- Supports the composite FK from camp_registrations (see below): a
    -- referencing row must match both id AND organization_id here, which is
    -- exactly what blocks cross-tenant camp_id/organization_id mismatches.
    constraint camps_id_organization_id_key unique (id, organization_id),

    constraint chk_camps_slug_not_blank check (trim(slug) <> ''),
    constraint chk_camps_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    constraint chk_camps_title_not_blank check (trim(title) <> ''),
    constraint chk_camps_date_range check (end_date >= start_date),
    constraint chk_camps_registration_window
        check (
            registration_start is null
            or registration_end is null
            or registration_end >= registration_start
        ),
    constraint chk_camps_age_min check (age_min >= 0),
    constraint chk_camps_age_max check (age_max >= age_min),
    constraint chk_camps_capacity check (capacity > 0),
    constraint chk_camps_price_cents check (price_cents >= 0),
    -- Lightweight ISO-4217-shaped sanity check, not a full currency lookup
    -- table — deliberately simple until a second currency is actually needed.
    constraint chk_camps_currency_format check (currency ~ '^[A-Z]{3}$'),
    constraint chk_camps_status
        check (status in ('draft', 'published', 'closed', 'archived'))
);

comment on table public.camps is
    'A bookable offering (camp week, course, session) owned by one organization.';

create trigger set_updated_at
    before update on public.camps
    for each row
    execute function public.set_updated_at();


-- ============================================================
-- camp_registrations — one child's registration for one camp
-- ============================================================

create table public.camp_registrations (
    id                          uuid        primary key default gen_random_uuid(),

    -- organization_id is denormalized (also derivable via camp_id -> camps
    -- .organization_id). Kept explicit and enforced by the composite FK
    -- below — see "Cross-tenant safety" comment for why this is required,
    -- not just a convenience column.
    organization_id             uuid        not null,
    camp_id                     uuid        not null,

    registration_token          uuid        not null default gen_random_uuid(),

    status                      text        not null default 'registered',
    payment_status              text        not null default 'open',

    parent_first_name           text        not null,
    parent_last_name            text        not null,
    parent_email                text        not null,
    parent_phone                text        not null,

    child_first_name            text        not null,
    child_last_name             text        not null,
    child_birth_date            date        not null,

    -- New vs. legacy KSV schema: legacy had no emergency-contact fields at
    -- all. Nullable for v1 — whether these should become mandatory is an
    -- open product decision, not a technical one (see database-schema.md).
    emergency_contact_name      text,
    emergency_contact_phone     text,

    medical_notes                text,
    allergies                   text,

    photo_permission             boolean    not null default false,

    -- Legacy had a single `consent_privacy` boolean covering both. Split
    -- here into terms/privacy so each consent is independently auditable.
    -- No default (mirrors legacy `consent_privacy`) — every insert must
    -- supply true explicitly, the check just guards against silently
    -- persisting a false/unaccepted registration.
    terms_accepted               boolean    not null,
    privacy_accepted             boolean    not null,

    stripe_session_id            text,
    stripe_payment_intent_id     text,

    paid_at                      timestamptz,
    email_sent_at                timestamptz,

    created_at                   timestamptz not null default now(),
    updated_at                   timestamptz not null default now(),

    constraint camp_registrations_registration_token_key unique (registration_token),

    -- The cross-tenant safeguard (see also section below):
    -- forces (camp_id, organization_id) to match an existing
    -- (id, organization_id) pair in camps — i.e. camp_id must actually
    -- belong to organization_id. ON DELETE RESTRICT: a camp with
    -- registrations can't be silently deleted (DSGVO child data).
    constraint camp_registrations_camp_org_fk
        foreign key (camp_id, organization_id)
        references public.camps (id, organization_id)
        on delete restrict,

    constraint chk_camp_registrations_parent_first_name_not_blank
        check (trim(parent_first_name) <> ''),
    constraint chk_camp_registrations_parent_last_name_not_blank
        check (trim(parent_last_name) <> ''),
    constraint chk_camp_registrations_parent_email_format
        check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint chk_camp_registrations_parent_phone_not_blank
        check (trim(parent_phone) <> ''),
    constraint chk_camp_registrations_child_first_name_not_blank
        check (trim(child_first_name) <> ''),
    constraint chk_camp_registrations_child_last_name_not_blank
        check (trim(child_last_name) <> ''),
    -- Structural plausibility only (not in the future, not absurdly old).
    -- Real age-vs-camp-age_min/age_max validation stays application-layer
    -- (needs the specific referenced camp, same pattern the legacy system
    -- already uses deliberately — see architecture.md / camp_config.py).
    constraint chk_camp_registrations_child_birth_date_plausible
        check (
            child_birth_date <= current_date
            and child_birth_date >= current_date - interval '100 years'
        ),
    constraint chk_camp_registrations_terms_accepted check (terms_accepted = true),
    constraint chk_camp_registrations_privacy_accepted check (privacy_accepted = true),
    constraint chk_camp_registrations_status
        check (status in ('registered', 'confirmed', 'cancelled', 'waitlist')),
    constraint chk_camp_registrations_payment_status
        check (payment_status in ('open', 'paid', 'refunded', 'waived', 'cancelled'))
);

comment on table public.camp_registrations is
    'One child''s registration for one camp. organization_id is denormalized '
    'and enforced via camp_registrations_camp_org_fk — see that constraint''s comment.';

create trigger set_updated_at
    before update on public.camp_registrations
    for each row
    execute function public.set_updated_at();

-- Stripe identifiers are unique when present, mirroring the legacy
-- partial-unique-index pattern (backend/schema.sql idx_camp_reg_stripe_session_id).
-- Both session and payment-intent ids are guarded: Stripe webhooks can key
-- off either depending on event type, and idempotent handling requires
-- each to be unique regardless.
create unique index camp_registrations_stripe_session_id_key
    on public.camp_registrations (stripe_session_id)
    where stripe_session_id is not null;

create unique index camp_registrations_stripe_payment_intent_id_key
    on public.camp_registrations (stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;


-- ============================================================
-- Indexes
--
-- Deliberately not indexed: `camps.organization_id` alone and
-- `camp_registrations.organization_id` alone — both are covered by a
-- composite index below via left-prefix matching, so a separate
-- single-column index would be redundant ("keine unnötigen Indizes").
-- ============================================================

create index camps_organization_id_status_idx
    on public.camps (organization_id, status);

-- Column order matches camp_registrations_camp_org_fk (camp_id,
-- organization_id) exactly, so it also serves as that FK's covering index
-- (Supabase's unindexed_foreign_keys advisor requires the leading columns
-- to match the FK's referencing column order, not just contain them) —
-- verified via `supabase db advisors --local`. Also covers plain
-- camp_id-only lookups via left-prefix, so no separate single-column
-- camp_id index is needed alongside it.
create index camp_registrations_camp_id_organization_id_idx
    on public.camp_registrations (camp_id, organization_id);

create index camp_registrations_organization_id_camp_id_idx
    on public.camp_registrations (organization_id, camp_id);

create index camp_registrations_parent_email_idx
    on public.camp_registrations (parent_email);

-- registration_token and the two stripe_* identifiers already have a
-- supporting unique index from their UNIQUE constraint/index above — no
-- additional index needed for lookups on those columns.


-- ============================================================
-- Row Level Security
--
-- RLS is enabled on all three tables with NO policies. Since `anon` and
-- `authenticated` do not bypass RLS, this means: zero rows visible or
-- writable for those roles, by default, with nothing further to configure.
-- `service_role` bypasses RLS entirely (Postgres BYPASSRLS role attribute,
-- not table ownership) and keeps full access — exactly matching how the
-- legacy backend/ talks to Supabase today via the service-role key.
--
-- Application-level organization filtering (explicit `WHERE organization_id
-- = :organization_id` in every backend_saas/ query, never trusted from a
-- client parameter) remains mandatory — see architecture.md 3.1. RLS becomes
-- the second protective layer once Supabase Auth and organization_members
-- exist (CP-S402 explicitly does not build user-facing policies yet).
-- ============================================================

alter table public.organizations       enable row level security;
alter table public.camps               enable row level security;
alter table public.camp_registrations  enable row level security;
