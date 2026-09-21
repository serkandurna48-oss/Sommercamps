-- CP-S408 — synthetic staging pilot tenant.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor for the Cloud
-- `CampsPilot SaaS` project (ref wkmckfbzhmihyfwiekct) -- never against the
-- Sommercamps/KSV project, never JK's. Idempotent, safe to re-run.
-- See backend_saas/seeds/README.md for why this lives here and not in
-- supabase/migrations/ or supabase/seed.sql.

insert into public.organizations (slug, name, contact_email, plan_status)
values ('campspilot-pilot', 'CampsPilot Staging Pilot', 'staging-pilot@campspilot.example', 'pilot')
on conflict (slug) do nothing;

-- capacity = 1 on purpose: the second registration in the smoke-test
-- procedure (backend_saas/README.md) is expected to land on the waitlist,
-- proving CP-S406's capacity/waitlist logic against a real deployment, not
-- just the test suite.
insert into public.camps (
    organization_id, slug, title, start_date, end_date,
    age_min, age_max, capacity, price_cents, currency, status
)
select id, 'staging-smoke-camp', 'Staging Smoke Test Camp',
       (current_date + interval '30 days')::date, (current_date + interval '32 days')::date,
       5, 12, 1, 100, 'EUR', 'published'
from public.organizations
where slug = 'campspilot-pilot'
on conflict (organization_id, slug) do nothing;
