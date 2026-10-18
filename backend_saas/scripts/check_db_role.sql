-- check_db_role.sql
-- Zeigt fuer die aktuelle DATABASE_URL-Verbindung: Rollenflags, Tabellenbesitz
-- und RLS-Einstellungen der SaaS-Kerntabellen sowie Anzahl Policies je Tabelle.
-- Keine Datenzeilen. Aendert nichts.
--
-- Ausfuehren: Supabase Dashboard → SQL Editor (Projekt "CampsPilot SaaS") oder
--   psql "$DATABASE_URL" -f backend_saas/scripts/check_db_role.sql
-- Ergebnisse: siehe docs/ops/cloud-pruefung.md

-- 1. Aktuelle Verbindungsrolle und Sicherheitsflags
SELECT
    current_user                        AS verbindungsrolle,
    r.rolsuper                          AS ist_superuser,
    r.rolbypassrls                      AS bypassed_rls
FROM pg_roles r
WHERE r.rolname = current_user;

-- 2. Tabellenbesitz und RLS-Flags der SaaS-Tabellen
SELECT
    c.relname                           AS tabelle,
    pg_get_userbyid(c.relowner)         AS besitzer,
    c.relrowsecurity                    AS rls_aktiv,
    c.relforcerowsecurity               AS rls_force
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
        'organizations',
        'camps',
        'camp_registrations',
        'platform_owners',
        'organization_members',
        'audit_log'
  )
ORDER BY c.relname;

-- 3. Anzahl Policies je Tabelle (kein Policy-Inhalt)
SELECT
    c.relname                           AS tabelle,
    COUNT(p.oid)                        AS anzahl_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
        'organizations',
        'camps',
        'camp_registrations',
        'platform_owners',
        'organization_members',
        'audit_log'
  )
GROUP BY c.relname
ORDER BY c.relname;
