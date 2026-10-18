-- list_test_tenants.sql
-- Listet alle Organisationen mit Anzahl Camps und Anmeldungen sowie
-- einem Verdachts-Flag fuer Testdaten (Slug oder Name enthaelt demo, test,
-- smoke, abnahme oder messung).
-- Keine Personendaten (keine Namen, E-Mails, Geburtsdaten, Notizen).
-- Aendert nichts.
--
-- Ausfuehren: Supabase Dashboard → SQL Editor (Projekt "CampsPilot SaaS") oder
--   psql "$DATABASE_URL" -f backend_saas/scripts/list_test_tenants.sql
-- Ergebnisse: siehe docs/ops/cloud-pruefung.md

SELECT
    o.slug,
    o.name,
    o.plan_status,
    COUNT(DISTINCT c.id)                AS camps,
    COUNT(DISTINCT r.id)                AS anmeldungen,
    o.created_at::date                  AS erstellt_am,
    CASE
        WHEN lower(o.slug) ~ '(demo|test|smoke|abnahme|messung)'
          OR lower(o.name) ~ '(demo|test|smoke|abnahme|messung)'
        THEN 'ja'
        ELSE ''
    END                                 AS verdacht_testdaten
FROM public.organizations o
LEFT JOIN public.camps c        ON c.organization_id = o.id
LEFT JOIN public.camp_registrations r ON r.organization_id = o.id
GROUP BY o.id, o.slug, o.name, o.plan_status, o.created_at
ORDER BY verdacht_testdaten DESC, o.created_at;
