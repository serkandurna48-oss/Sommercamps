# S3 – RLS-Lesepolicies (nur isoliert getestet)

Migration: `supabase/migrations/20261018154831_tenant_read_policies.sql`.
Status: lokal vorbereitet und getestet; **nicht auf eine Cloud-DB angewendet**.
Ältere Beschreibungen „RLS ohne Policies“ beschreiben den Stand vor dieser Migration.

Die Policies nutzen `auth.uid()` und die vorhandenen DB-Mitgliedschaften, keine
Organisation oder Rolle aus benutzerveränderbaren JWT-Metadaten. Keine neuen
Spalten, personenbezogenen Daten oder Dependencies; keine Änderung der Datenschutzerklärung.

| Tabelle | org_admin | platform_owner | anon / ohne Zuordnung |
|---|---|---|---|
| organizations, camps, camp_registrations | Eigene Organisation(en) | Alle | Keine Zeilen |
| organization_members | Eigene Mitgliedschaften | Eigene Mitgliedschaften | Keine Zeilen |
| platform_owners | Keine Zeilen | Eigener Rolleneintrag | Keine Zeilen |
| audit_log | Keine Zeilen | Alle | Keine Zeilen |

Nur SELECT-Policies werden angelegt. Direkte INSERT/UPDATE/DELETE bleiben für
`authenticated` und `anon` gesperrt, auch für Owner. Die Backend-Schreibpfade bleiben
zuständig für Validierung, Kapazität, Rollenvergabe und Audit. Verbindungen mit
`BYPASSRLS` werden weiterhin nicht eingeschränkt; explizite Backend-Tenantfilter
bleiben Pflicht. Browser-Zugriffe werden durch dieses Paket nicht umgestellt.

Die Migration ist wiederholbar: eigene Policies werden mit `DROP POLICY IF EXISTS`
ersetzt. Andere Policies werden nicht gelöscht; vor einer späteren Cloud-Anwendung
muss deren tatsächlicher Stand geprüft werden. Dieses Paket enthält kein Deployment.

## Spaltenrechte (UC6 — Column-Level Grants)

Migration: `supabase/migrations/20261022000000_column_level_grants.sql`.
Status: lokal vorbereitet und getestet; **nicht auf eine Cloud-DB angewendet**.

### Problem

`20261018154831_tenant_read_policies.sql` vergibt tabellenweites `SELECT` auf `organizations`
und `organization_members` an `authenticated`. Da der Supabase-`anon`-Key und die Supabase-URL
im Frontend öffentlich sind, konnte ein eingeloggter Vereins-Admin über die PostgREST-REST-API
**alle Spalten** seiner Organisation lesen — auch interne und personenbezogene Felder.

Das Frontend (Next.js) liest diese Tabellen **ausschließlich** über FastAPI-Endpunkte (nie
direkt via `supabase-js` oder PostgREST). Der Schutz in den API-Schemas (`schemas.py` /
`admin_schemas.py`) allein reicht nicht aus, solange PostgREST den Direktzugriff ermöglicht.

### Fix

Tabellenweites `SELECT` für `authenticated` entziehen, dann **nur die unbedenklichen Spalten**
als Column-Level-Grant wiedergeben.

| Tabelle | Ausgenommene Spalten (nicht mehr lesbar) | Grund |
|---|---|---|
| `organizations` | `billing_notes` | Interne Vertragsnotizen des Plattformbetreibers |
| `organizations` | `stripe_account_id` | Sensibles Stripe-Connect-Konfigurations-ID |
| `organization_members` | `notification_email` | Private Kontaktdaten (Datenschutz) |
| `organization_members` | `notification_phone` | Private Kontaktdaten, E.164 (Datenschutz) |
| `organization_members` | `whatsapp_consent_at` | DSGVO-Einwilligungsstempel |

Alle anderen Spalten beider Tabellen bleiben für `authenticated` über Column-Level-Grants
zugänglich (selektiv benannt in der Migration, nicht per `SELECT *`).

### Regel für neue sensible Spalten

Bevor eine neue Spalte zu `organizations` oder `organization_members` hinzugefügt wird:
1. **Ist die Spalte für Vereins-Admins sichtbar?** Wenn nein → ausschließlich über
   Backend-Endpunkte exponieren und die neue Spalte NICHT in den Column-Level-Grant
   von `20261022000000` aufnehmen.
2. **Ist die Spalte neu und soll sichtbar sein?** → Die neue Migration muss die Spalte
   explizit zur `GRANT SELECT (...)` Liste in `20261022000000` hinzufügen (Folgemigration
   oder Patch-Migration), oder eine neue Migration erstellt den Grant neu.
3. **Keine impliziten Grants** — nach dem Deploy von `20261022000000` gibt es kein
   tabellenweites `SELECT` mehr für `authenticated`; neue Spalten sind automatisch
   gesperrt, bis sie explizit gewährt werden.

### Verifikation (UC6)

Gleiche Umgebung wie S3 (Abschnitt unten). Zusätzliche Prüfungen:
- `SELECT billing_notes FROM organizations` → `permission denied` für `authenticated`
- `SELECT stripe_account_id FROM organizations` → `permission denied` für `authenticated`
- `SELECT name, slug FROM organizations WHERE id=...` → 1 Zeile für Vereins-Admin (eigene Org)
- Entsprechende Tests für alle drei `organization_members`-Spalten

```powershell
$env:REVIEW_POSTGRES_PORT='55443'
.\venv\Scripts\python.exe -B -m pytest tests/test_rls_postgres.py -q -p no:cacheprovider --tb=short
```

## Vor Cloud-Anwendung

Bevor die Migration auf dem produktiven CampsPilot-SaaS-Supabase-Projekt
(`backend_saas/`) ausgeführt wird:

1. `supabase/check_db_role.sql` im SQL-Editor des Projekts (pilot oder auth,
   Rolle `postgres`/`service_role`) ausführen.
2. Gibt die Abfrage Zeilen zurück, existieren Policies auf den sechs Tabellen,
   die nicht mit `s3_` beginnen. Die Migration würde sofort mit einem
   `RAISE EXCEPTION` abbrechen (kein s3_-Zustand wird angelegt).
3. Bei Fremdpolicies entscheidet **Serkan**: Policy entfernen oder umbenennen,
   dann Migration erneut prüfen.

Die Migration enthält keinen automatischen Löschpfad für Fremdpolicies —
die Entscheidung bleibt beim Menschen.

## Verifikation

Eigener PostgreSQL-Cluster auf `127.0.0.1:55443`, zufällige Testdatenbank mit allen
Repository-Migrationen; ausschließlich synthetische Daten. `auth.users` und
`auth.uid()` sind minimale lokale Nachbildungen. Das prüft PostgreSQL-RLS mit
`SET LOCAL ROLE` und simulierten verifizierten JWT-Claims, keinen Supabase-Auth-
oder PostgREST-End-to-End-Flow. Die Fixture liest nie `DATABASE_URL` und löscht
ihre eigene Testdatenbank nach dem Lauf.

```powershell
cd backend_saas
$env:REVIEW_POSTGRES_PORT='55443'
.\venv\Scripts\python.exe -B -m pytest tests/test_rls_postgres.py tests/test_review_postgres.py -q -p no:cacheprovider --tb=short
```

Ergebnis: **21 passed**, zwei bestehende Testclient-Deprecation-Warnungen.
Abgedeckt: A liest nur A und B nur B ohne Query-Tenantfilter; Owner liest beide;
anon, fehlende Identität und Nutzer ohne Mitgliedschaft sehen nichts; gefälschte
Metadaten erweitern keine Rechte; entzogene Mitgliedschaft wirkt sofort;
INSERT/UPDATE/DELETE auf allen sechs Tabellen bleiben gesperrt; wiederholte
Migration sowie bestehende lokale API-/Concurrency-Integrationstests bestehen.

Fachlicher Referenzstand: [Supabase RLS-Dokumentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
