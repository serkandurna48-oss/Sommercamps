feat/f1-anbieter-bedingungen

STATUS: fertig zur Prüfung

COMMIT: ca72166 feat: F1 eigene Teilnahmebedingungen je Anbieter

TESTS:
- backend_saas/tests: 533 passed, 29 subtests passed (0 failed)
- frontend (vitest): 24 test files, 193 tests passed (0 failed)

LINT: 0 errors, 9 warnings (alle vorbestehend, nicht von diesem Branch)
TSC: 0 errors

ÄNDERUNGEN:
1. supabase/migrations/20261020170000_org_terms_text.sql — neue Spalte terms_text (nullable, IF NOT EXISTS, idempotent)
2. backend_saas/app/schemas.py — terms_text in OrganizationPublic (öffentliche API)
3. backend_saas/app/admin_schemas.py — terms_text in OrganizationCreate, OrganizationUpdate (max. 20 000 Zeichen, leer → NULL), OrganizationAdminOut
4. backend_saas/app/repositories/organizations.py — terms_text in _ORGANIZATION_FIELDS und _INSERT_ORGANIZATION
5. backend_saas/tests/test_admin_organizations_api.py — 3 neue Tests: setzt/löscht Feld, Länge > 20 000 → 422
6. backend_saas/tests/test_organizations_api.py — terms_text im öffentlichen Feldset, 2 neue Tests
7. backend_saas/tests/test_schema_upgrade_populated.py — neue Migration in _WELLE2_FILES, NULL-Check für pre-existing rows
8. frontend/app/lib/saasApi.ts — terms_text in OrganizationPublic (Interface)
9. frontend/app/lib/saasAdminApi.ts — terms_text in OrganizationAdmin und OrganizationConfigUpdate
10. frontend/app/components/saas/config/OrganizationConfigForm.tsx — Textarea "Teilnahme- und Stornobedingungen", Hinweis "Absätze durch Leerzeile trennen"
11. frontend/app/components/saas/actions/configActions.ts — terms_text in updateOrganizationConfigAction
12. frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx — bedingter Abschnitt "Bedingungen von ANBIETER" (split /\n\n+/, kein dangerouslySetInnerHTML); ohne Text: bisheriger Verweis
13. frontend/app/components/saas/config/OrganizationConfigForm.test.tsx — terms_text: null in Fixture, neuer Test
14. frontend/app/components/saas/actions/configActions.test.ts — terms_text in BASE_FIELDS, 2 neue Tests
15. frontend/app/pilot/[org]/pages.test.tsx — DEFAULT_ORG als OrganizationPublic, 4 neue Tests (mit Text, XSS-Escaped, ohne Text, beforeEach-Mock)
16. docs/ops/go-live-welle2.md — Abschnitt "Nachtrag F1" mit SQL-Zeile und Prüfabfrage
17. Nebenänderungen: terms_text: null in a11y.test.tsx, DoneScreen.test.tsx, heroLab.test.tsx, legal.test.tsx, logo-unoptimized.test.tsx, m1motion.test.ts, ParentFlow.test.tsx, setupProgress.test.ts, platform/preview/page.tsx

NICHT_AUSGEFÜHRT:
- Migration auf der Cloud-Datenbank (muss Serkan selbst im Supabase SQL-Editor ausführen, siehe docs/ops/go-live-welle2.md Nachtrag F1)
- Push / PR erstellt (nur lokaler Commit per Vorgabe)
