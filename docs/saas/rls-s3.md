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
