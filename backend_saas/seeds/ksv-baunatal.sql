-- CP-S410 — KSV Baunatal as a real CampsPilot tenant.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor for the Cloud
-- `CampsPilot SaaS` project (ref wkmckfbzhmihyfwiekct) -- never against the
-- Sommercamps/KSV project. Idempotent, safe to re-run. Does NOT touch or
-- migrate any row in the KSV backend/ database -- this only adds rows to
-- the separate CampsPilot SaaS project. See backend_saas/seeds/README.md.
--
-- Sourced from frontend/app/lib/clubConfig.tsx (name, accentColor,
-- contactPhone, logoSrc) and frontend/app/impressum/page.tsx (legal_name,
-- contact_email) -- not invented data.
--
-- Flagged gaps (see backend_saas/README.md CP-S410 "Known gaps" for detail):
--   - capacity (40): not a real figure from anywhere in backend/ -- the
--     legacy system enforces no cap. Placeholder pending a real number.
--   - logo_url ('/logo.svg'): a relative path that only resolves because
--     /pilot/[org] is currently served by the same Next.js deployment as
--     the legacy KSV site.

insert into public.organizations (slug, name, legal_name, contact_email, contact_phone, logo_url, primary_color, plan_status)
values (
    'ksv-baunatal', 'KSV Baunatal', 'KSV Baunatal e.V.',
    'info@ksv-baunatal.de', '0170 9927281',
    '/logo.svg',
    '#CC0000',        -- KSV red, clubConfig.tsx default accentColor
    'pilot'
)
on conflict (slug) do nothing;

-- Three camp weeks -- source: backend/camp_config.py CAMP_WEEKS +
-- CAMP_AGE_MIN/MAX (5-12). price_cents: backend/.env.example's
-- STRIPE_PRICE_CENTS example (14900 = 149 EUR).
insert into public.camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, price_cents, currency, status)
select id, v.slug, v.title, v.start_date, v.end_date, 5, 12, 40, 14900, 'EUR', 'published'
from public.organizations, (values
    ('ksv-sommercamp-2026-06-29', 'Sommercamp', date '2026-06-29', date '2026-07-02'),
    ('ksv-sommercamp-2026-08-03', 'Sommercamp', date '2026-08-03', date '2026-08-06'),
    ('ksv-sommercamp-2026-10-05', 'Sommercamp', date '2026-10-05', date '2026-10-08')
) as v(slug, title, start_date, end_date)
where organizations.slug = 'ksv-baunatal'
on conflict (organization_id, slug) do nothing;
