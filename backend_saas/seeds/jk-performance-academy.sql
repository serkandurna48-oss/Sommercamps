-- CP-S410 — JK Performance Academy as a real CampsPilot tenant.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor for the Cloud
-- `CampsPilot SaaS` project (ref wkmckfbzhmihyfwiekct) -- never against the
-- Sommercamps/KSV project, never JK's own backend/ database. Idempotent,
-- safe to re-run. See backend_saas/seeds/README.md.
--
-- Sourced from frontend/app/lib/clubConfig.jk.tsx -- not invented data.
--
-- Flagged gaps (see backend_saas/README.md CP-S410 "Known gaps" for detail):
--   - contact_email is a KNOWN PLACEHOLDER in clubConfig.jk.tsx itself
--     ("platzhalter@..."), not invented here -- replace once Jan confirms
--     a real address (clubConfig.jk.tsx L7, L32-35).
--   - JK's two real camps run at PARTNER clubs with two-tier pricing
--     (member/external) -- clubConfig.jk.tsx PROGRAMS entries "Sommercamp
--     bei FSK Vollmarshausen" / "... TSV Wolfsanger". This schema has one
--     price_cents field, not two -- using the MEMBER rate (149 EUR) here
--     is a simplification, not a real pricing decision. Revisit before any
--     real payment collection goes live (backend_saas has no Stripe
--     integration yet regardless, so payment_status stays 'open' either way).
--   - capacity (30): not stated anywhere for these partner-club camps --
--     placeholder.
--   - logo_url ('/jk/logo.jpg'): a relative path that only resolves because
--     /pilot/[org] is currently served by the same Next.js deployment as
--     the legacy JK preview site.

insert into public.organizations (slug, name, contact_email, logo_url, primary_color, plan_status)
values (
    'jk-performance-academy', 'JK Performance Academy',
    'platzhalter@jk-performance-academy.example',
    '/jk/logo.jpg',
    '#B8912B',        -- clubConfig.jk.tsx accentColor
    'pilot'
)
on conflict (slug) do nothing;

insert into public.camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, price_cents, currency, status)
select id, v.slug, v.title, v.start_date, v.end_date, v.age_min, v.age_max, 30, 14900, 'EUR', 'published'
from public.organizations, (values
    ('fsk-vollmarshausen-2026-07-08', 'Sommercamp bei FSK Vollmarshausen', date '2026-07-08', date '2026-07-10', 6, 14),
    ('tsv-wolfsanger-2026-07-29', 'Sommercamp bei TSV Wolfsanger', date '2026-07-29', date '2026-07-31', 8, 14)
) as v(slug, title, start_date, end_date, age_min, age_max)
where organizations.slug = 'jk-performance-academy'
on conflict (organization_id, slug) do nothing;
