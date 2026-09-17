-- ============================================================
-- CampsPilot SaaS — local dev seed data (CP-S402)
--
-- Loaded automatically by `supabase db reset` (see config.toml
-- db.seed.sql_paths). Never run against a real/hosted project without
-- checking first — this is local-dev-only fixture data.
--
-- No real people, no JK or KSV data. One demo organization, one demo camp,
-- zero registrations (a camp "ohne reale Teilnehmer" per CP-S402 scope).
-- Kept separate from the schema migration on purpose, per ticket.
-- ============================================================

insert into public.organizations
    (slug, name, contact_email, plan_status)
values
    ('demo-fc', 'Demo Football Academy', 'demo@campspilot.example', 'pilot');

insert into public.camps
    (organization_id, slug, title, start_date, end_date,
     age_min, age_max, capacity, price_cents, currency, status)
select
    id, 'summer-week-1', 'Summer Camp — Week 1',
    date '2027-07-05', date '2027-07-09',
    6, 12, 20, 12900, 'EUR', 'published'
from public.organizations
where slug = 'demo-fc';
