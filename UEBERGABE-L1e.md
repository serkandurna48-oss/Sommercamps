design/l1e-trainer

STATUS: fertig zur Prüfung

COMMIT: design: L1e Trainer-Sektion

TESTS:
- npx vitest run: 93/93 bestanden; 15/16 Suiten grün
  Einziger Fehlschlag: app/lib/dateTimeInput.test.ts — pre-existing CWD-Fehler
  (readFileSync mit relativem Pfad, der nur aus dem frontend/-Verzeichnis klappt;
  nicht durch diese Änderung eingeführt, schlägt auf dem Branch-Ausgangspunkt
  genauso fehl)
- npx tsc --noEmit: 0 Fehler

RLS_PRÜFUNG:
Migration 20261018154831_tenant_read_policies.sql prüft:
  s3_organization_read policy: FOR SELECT TO authenticated USING (...)
  → Zeilenbasierte Policy, kein Column-Level-Grant.
  PostgreSQL RLS kennt kein "Spalten-RLS" via Policies; neue Spalten in einer
  Tabelle unterliegen automatisch denselben Zeilenpolicies wie alle anderen
  Spalten — keine RLS-Anpassung nötig.
  Zusätzlich: das Backend nutzt psycopg2 mit service-role key (BYPASSRLS),
  d. h. RLS greift für Backend-Verbindungen ohnehin nicht. Die öffentliche
  API exponiert nur Felder, die explizit in OrganizationPublic (schemas.py)
  deklariert sind — das ist der eigentliche Schutz vor ungewollter Exposition.

NICHT_AUSGEFÜHRT:
- pytest (Backend-Tests) — laut Aufgabenstellung Sache des Prüfers
- Supabase-Migration in der Cloud appliziert
- npm run build (Next.js)
- Kein Push, kein Merge

GEÄNDERTE DATEIEN:
  supabase/migrations/20261019203000_org_trainer.sql          (neu)
  backend_saas/app/schemas.py                                 OrganizationPublic +2 Felder
  backend_saas/app/repositories/organizations.py             _ORGANIZATION_FIELDS + _INSERT
  backend_saas/app/admin_schemas.py                          OrganizationCreate/Update/AdminOut
  backend_saas/scripts/seed_demo.py                          ORGANIZATION dict + branding patch
  backend_saas/tests/test_organizations_api.py               +2 Tests, expected-keys-Set erweitert
  frontend/app/lib/saasApi.ts                                OrganizationPublic interface
  frontend/app/lib/saasAdminApi.ts                           OrganizationAdmin interface
  frontend/app/lib/i18n/de.ts                                publicUI.trainer.heading
  frontend/app/pilot/[org]/ParentFlow.tsx                    img-strip → trainer-sec
  frontend/app/pilot/[org]/ParentFlow.test.tsx               +3 Tests, org-Fixture erweitert
  frontend/app/pilot/[org]/publicTheme.css                   img-strip CSS → trainer-sec CSS
  frontend/app/platform/(console)/[org]/preview/page.tsx     orgPublic-Mapping
  frontend/app/pilot/[org]/DoneScreen.test.tsx               org-Fixture erweitert
  frontend/app/components/saas/config/OrganizationConfigForm.test.tsx  org-Fixture erweitert
  frontend/app/platform/setupProgress.test.ts                org-Fixture erweitert
