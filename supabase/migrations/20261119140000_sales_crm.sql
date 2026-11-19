-- Zweck: Vertriebs-CRM, Stufe 1 (feat/vertrieb-crm). Vertriebler und
-- Vertriebsleiter verwalten Interessenten (Vereine, Fußballschulen) unter
-- /vertrieb. Komplett getrennt von Vereins- und Kinderdaten: keine Spalte
-- und kein Fremdschlüssel verweist auf organizations, camps oder
-- camp_registrations. Eine Vertriebsrolle gewährt keinerlei Vereins- oder
-- Plattformrechte (siehe app/routers/sales.py).
--
-- Anwendungsstatus: nur lokal geprüft (backend_saas/tests/test_sales_postgres.py
-- gegen eine Wegwerf-Datenbank). In Staging und Production führt Serkan
-- diese Datei im Supabase-SQL-Editor aus, nie der Agent.
--
-- Auswirkungen: rein additiv (drei neue Tabellen). Idempotent. Rollback:
--   drop table if exists public.sales_activities, public.sales_leads, public.sales_members;
-- (löscht alle Vertriebsdaten; vorher bei Bedarf exportieren).
--
-- RLS aktiviert ohne Policies = für anon/authenticated über PostgREST
-- unsichtbar; backend_saas greift über DATABASE_URL zu und setzt die
-- Rechte applikatorisch durch (gleiches Muster wie platform_owners).

create table if not exists public.sales_members (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('sales_rep', 'sales_lead')),
    display_name text not null check (char_length(display_name) between 1 and 80),
    active boolean not null default true,
    created_at timestamptz not null default now()
);
comment on table public.sales_members is 'Vertriebskonten: sales_rep sieht nur eigene Leads, sales_lead alle Leads und das Team. Keine Vereins- oder Plattformrechte. Deaktivieren statt löschen, damit die Lead-Historie lesbar bleibt.';
alter table public.sales_members enable row level security;

create table if not exists public.sales_leads (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 200),
    kind text not null default 'verein' check (kind in ('verein', 'fussballschule', 'sonstige')),
    city text check (city is null or char_length(city) <= 120),
    website text check (website is null or char_length(website) <= 500),
    contact_name text check (contact_name is null or char_length(contact_name) <= 120),
    phone text check (phone is null or char_length(phone) <= 60),
    email text check (email is null or char_length(email) <= 254),
    fit text check (fit is null or fit in ('A', 'B', 'C')),
    source_url text check (source_url is null or char_length(source_url) <= 500),
    status text not null default 'neu'
        check (status in ('neu', 'kontaktiert', 'gespraech', 'demo', 'angebot', 'gewonnen', 'verloren')),
    owner_user_id uuid references auth.users(id) on delete set null,
    next_action_at date,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
comment on table public.sales_leads is 'Interessenten für CampsPilot (B2B). owner_user_id = zuständiger Vertriebler, null = noch nicht verteilt.';
create index if not exists idx_sales_leads_owner on public.sales_leads(owner_user_id);
create index if not exists idx_sales_leads_status on public.sales_leads(status);
create index if not exists idx_sales_leads_next_action on public.sales_leads(next_action_at);
alter table public.sales_leads enable row level security;

create table if not exists public.sales_activities (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references public.sales_leads(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    kind text not null check (kind in ('angelegt', 'notiz', 'status', 'zuweisung')),
    body text check (body is null or char_length(body) <= 4000),
    created_at timestamptz not null default now()
);
comment on table public.sales_activities is 'Verlauf je Lead: Notizen, Statuswechsel, Zuweisungen. Nur anhängen, nie ändern.';
create index if not exists idx_sales_activities_lead on public.sales_activities(lead_id, created_at desc);
alter table public.sales_activities enable row level security;
