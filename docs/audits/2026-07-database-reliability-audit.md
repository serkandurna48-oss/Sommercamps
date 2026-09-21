# Datenbank-Zuverlaessigkeits-Audit, Juli 2026

Stand: 2026-07-21  
Scope: CampsPilot/Sommercamps Repository, Backend auf Render, Supabase PostgreSQL, psycopg2 ThreadedConnectionPool, Health-Endpunkt.

## 1. Executive Summary

Root Cause ist nicht endgueltig bewiesen, weil keine Produktionslogs aus einem akuten Ausfall vorliegen. Die hoechste Evidenz liegt aber beim lokalen Connection-Lifecycle: Der bisherige Code gab psycopg2-Verbindungen nach `OperationalError`, `InterfaceError`, geschlossener Verbindung oder fehlgeschlagenem `rollback()` normal in den `ThreadedConnectionPool` zurueck. Ein Render-Restart behebt exakt diesen Zustand plausibel, weil der Prozess und damit der lokale Pool neu aufgebaut werden.

Konfidenz: 80 Prozent fuer "defekte Connection wird wieder gepoolt" als primaere Ursache oder wesentlicher Verstaerker. Nicht bewiesen sind Supabase-/PgBouncer-, DNS-, TLS- oder regionale Stoerungen als urspruenglicher Ausloeser. Sie bleiben moegliche Trigger, nicht die im Code belegte Persistenzursache.

Umgesetzt wurde ein minimaler Fix in `backend/main.py`: sichere DSN-Erweiterung, `connect_timeout` und TCP-Keepalives, verworfene defekte Connections via `putconn(..., close=True)`, genau ein Retry nur beim Checkout einer bereits geschlossenen Connection, kein Retry um mutierende Transaktionen, thread-safe Pool-Reset-Hook. Ergaenzt wurden 21 Fake-basierte pytest-Tests ohne Produktions-DB.

## 2. Systemuebersicht

Komponenten:

- Browser/Next.js Frontend auf Vercel, KSV produktiv, JK Preview/Isolierung in Arbeit.
- FastAPI/Uvicorn Backend auf Render Frankfurt.
- Supabase PostgreSQL in Europa, Connection ueber Supabase Transaction Pooler Port 6543.
- psycopg2/ThreadedConnectionPool im Backend-Prozess.
- Externe Dienste: Stripe Checkout/Webhook, Brevo SMTP API.

Datenfluesse:

- `GET /config`: Frontend liest Camp-Preis, Altersgrenzen, Wochen und Clubwerte.
- `POST /registrations`: oeffentlicher Schreibpfad in `camp_registrations`, danach best-effort Brevo-Mail.
- Admin-Login: `POST /admin/login` prueft `ADMIN_PASSWORD`, gibt HS256-JWT aus.
- Admin-Reads/Writes: Bearer-JWT, DB-Queries ueber denselben Pool.
- Stripe Checkout: liest Registrierung per `registration_token`, erstellt Stripe Session, speichert `stripe_session_id`.
- Stripe Webhook: verifiziert Signatur, setzt `payment_status='paid'` idempotent mit `AND payment_status != 'paid'`.
- `/health`: fuehrt `SELECT 1` ueber `db_cursor()` aus und liefert 200 oder 503.

Konfigurationsquellen:

- Backend: Render-Dashboard und lokale `backend/.env`; `backend/render.yaml` ist unvollstaendig.
- Frontend: Vercel-Dashboard und `frontend/.env.local`.
- Repo-Dokumentation: README, CLAUDE, DEPLOYMENT, Kunden-/Architekturdokumente.

Kritische Produktionsabhaengigkeiten:

- Render Runtime und Service-Plan.
- Supabase Transaction Pooler Limits und Idle-Verhalten.
- psycopg2/libpq SSL-Verbindungen.
- Nicht reproduzierbar gepinnte Python/Pip-Abhaengigkeiten.

## 3. Incident-Symptome

Beobachtet wurde wiederholt:

1. Backend oder `/health` erreicht DB nicht mehr.
2. Env-/Connection-String-Checks zeigen keinen offensichtlichen Drift.
3. Render-Service-Restart behebt den Fehler unmittelbar.
4. Fehler tritt spaeter erneut auf.

Ein frueherer `KeyError: 'ADMIN_PASSWORD'` ist durch Env-Var-Bereinigung plausibel geloest und erklaert die spaeteren wiederkehrenden Pool-Ausfaelle nicht hinreichend.

## 4. Analysierte Dateien

Vollstaendig oder gezielt analysiert:

- `backend/main.py`
- `backend/camp_config.py`
- `backend/schema.sql`
- `backend/migration_phase1.sql`
- `backend/migration_phase2.sql`
- `backend/migration_phase3.sql`
- `backend/migration_jersey_sizes.sql`
- `backend/migration_fix_age_constraint.sql`
- `backend/requirements.txt`
- `backend/requirements-dev.txt`
- `backend/render.yaml`
- `backend/.env.example`
- `backend/test_db.py`
- `backend/tests/test_db_reliability.py`
- `.github/workflows/ci.yml`
- `README.md`
- `CLAUDE.md`
- `TODO.md`
- `DEPLOYMENT.md`
- `SESSION_NOTES.md`
- `docs/architecture/system-overview.md`
- `docs/customers/ksv.md`
- `docs/customers/jk-performance.md`
- `docs/onboarding/jk-infrastructure-setup.md`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/app/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/components/RegistrationForm.tsx`
- `frontend/app/lib/campConfig.ts`
- `frontend/app/lib/clubConfig.tsx`
- `frontend/.env.local.example`
- `start-dev.ps1`

Nicht analysiert: echte `.env`-Secrets, produktive Datenbankinhalte, externe Dashboards.

## 5. Bestaetigte Schwachstellen

### F-01 Defekte DB-Connections konnten normal in den Pool zurueckgehen

Kategorie: Datenbank/Connection-Lifecycle  
Schweregrad: High  
Konfidenz: Hoch

Evidenz vor Fix: `db_cursor()` rollte bei beliebiger Exception zurueck und liess danach `get_db_connection()` im `finally` immer `_pool.putconn(conn)` ohne `close=True` ausfuehren. Weder `OperationalError` noch `InterfaceError` noch `conn.closed` wurden gezielt behandelt.

Betroffene Datei: `backend/main.py`, alter Bereich um Pool/Context-Manager; neuer Fix in `backend/main.py:147-196` und `backend/main.py:251-306`.

Produktionsauswirkung: Ein von Supabase/PgBouncer/Netzwerk beendeter Socket kann wiederholt an Requests ausgegeben werden. Render-Restart behebt das plausibel durch Prozess- und Pool-Neuaufbau.

Massnahme: umgesetzt. Defekte Connections werden mit `close=True` verworfen.

### F-02 DATABASE_URL wurde fehlerhaft erweitert, falls Query-Parameter existierten

Kategorie: Deployment/DB-Konfiguration  
Schweregrad: Medium  
Konfidenz: Hoch

Evidenz: Der alte Code haengte `?sslmode=require` direkt an, wenn kein `sslmode=` im String vorkam. Bei einer URL mit vorhandenen Parametern waere ein zweites `?` entstanden.

Betroffene Datei: neuer Fix `backend/main.py:110-126`.

Massnahme: umgesetzt. Query-Parameter werden mit `urllib.parse` zusammengefuehrt und `sslmode` wird nicht dupliziert.

### F-03 Keine expliziten DB-Timeouts/Keepalives

Kategorie: Datenbank/Netzwerk  
Schweregrad: Medium  
Konfidenz: Hoch

Evidenz: `ThreadedConnectionPool` wurde ohne `connect_timeout` oder Keepalive-Parameter erstellt.

Massnahme: umgesetzt. Defaults: `connect_timeout=5`, `keepalives=1`, `keepalives_idle=30`, `keepalives_interval=10`, `keepalives_count=5` in `backend/main.py:115-122`.

### F-04 Runtime und Dependencies sind nicht reproduzierbar gepinnt

Kategorie: Runtime/Deployment  
Schweregrad: Medium  
Konfidenz: Hoch

Evidenz: `backend/render.yaml` enthaelt keinen `PYTHON_VERSION`-Pin, keine `.python-version`/`runtime.txt` im Repo. `requirements.txt` nutzt durchgaengig `>=`.

Externe Evidenz: Render dokumentiert `3.14.3` als aktuellen Default fuer neue Services und empfiehlt explizites Setzen per `PYTHON_VERSION` oder `.python-version`: https://render.com/docs/python-version. PyPI zeigt inzwischen psycopg2-binary 2.9.12 mit cp314-Wheels, sodass Python 3.14 nicht allein als Ursache belegt ist: https://pypi.org/project/psycopg2-binary/.

Massnahme: nicht umgesetzt, empfohlen separat: `.python-version` oder Render `PYTHON_VERSION` auf eine bewusst gewaehlte stabile Version pinnen und Requirements per Constraints/Lock reproduzierbar machen.

### F-05 test_db.py kann versehentlich gegen Production-DATABASE_URL laufen

Kategorie: Betrieb/Sicherheit  
Schweregrad: High  
Konfidenz: Hoch

Evidenz: `backend/test_db.py` liest direkt `os.environ["DATABASE_URL"]` und verbindet. CLAUDE.md warnt selbst vor diesem Risiko. Kein Schutz gegen Production-URL.

Massnahme: nicht geaendert, weil der Auftrag auf reproduzierbare Fake-Tests zielte. Empfohlen: deaktivieren, in `manual_test_db.py` umbenennen oder nur `TEST_DATABASE_URL` erlauben.

### F-06 HTTP-Responses leaken teilweise rohe Exception-Details

Kategorie: API/Security  
Schweregrad: Medium  
Konfidenz: Hoch

Evidenz: Beispiele: `create_registration()` gibt `Anmeldung konnte nicht gespeichert werden: {exc}` zurueck (`backend/main.py:1077-1080`), mehrere Admin-/Checkout-Fehler geben DB- oder Stripe-Details direkt weiter.

Massnahme: Backlog. Nicht im Minimalfix enthalten, um API-Vertraege nicht breit zu veraendern.

### F-07 registration_token steht im URL-Pfad

Kategorie: Security/Privacy  
Schweregrad: Medium  
Konfidenz: Hoch

Evidenz: `POST /registrations/{registration_token}/checkout-session` (`backend/main.py:1285-1290`) und Frontend-Aufruf ueber URL-Pfad. Uvicorn/Render Access Logs koennen Pfade speichern.

Massnahme: Backlog. Routing-Aenderung waere API-Vertragsaenderung.

### F-08 Stripe Checkout hat Duplicate-Risiken

Kategorie: Idempotenz/Payment  
Schweregrad: Medium  
Konfidenz: Mittel

Evidenz: Jeder Checkout-Request kann eine neue Stripe Session erstellen, bevor `stripe_session_id` gespeichert wird. Bei DB-Fehler nach Stripe-Erfolg bleibt die Stripe Session trotzdem existent.

Massnahme: Backlog. Vor Session-Erstellung bestehende offene Session pruefen oder Stripe-Idempotency-Key nutzen.

## 6. Wahrscheinliche Schwachstellen

- Supabase Transaction Pooler kann langlebige Client-Verbindungen durch Idle-/Netzwerkereignisse beenden. Der bisherige App-Pool war dagegen nicht robust.
- Bei Render-Free/Paid-Konfigurationsdrift koennen Plan, Cold Starts und Health-Verhalten anders sein als `render.yaml` suggeriert.
- Mehrere Uvicorn-Worker wuerden pro Prozess je einen eigenen Pool mit `maxconn=10` erzeugen. Aktuell ist kein Worker-Count im Repo gepinnt.

## 7. Verworfene oder nicht belegte Hypothesen

- `ADMIN_PASSWORD` als aktuelle Ursache: nicht belegt fuer wiederkehrende DB-Ausfaelle; erklaert Startfehler, aber nicht "Restart behebt DB".
- Python 3.14.3 als alleinige Ursache: moeglich als Reproduzierbarkeitsrisiko, aber nicht stark belegt. Aktuelle PyPI-Metadaten zeigen fuer zentrale Pakete grundsaetzliche Python-3.14-Kompatibilitaet oder `>=3.x`-Support; Stripe klassifiziert aktuell nicht explizit Python 3.14, daher bleibt Restunsicherheit.
- Externe regionale Stoerung: moeglich, aber ohne Statusseiten/Logs zum Ausfallzeitpunkt nicht belegbar.

## 8. Root-Cause-Hypothesenmatrix

| # | Hypothese | Evidenz im Code | Evidenz dagegen | Symptom | Restart plausibel? | Reproduzierbarkeit | Konfidenz | Naechster Test |
|---|---|---|---|---|---|---|---:|---|
| 1 | Defekte Connection wird erneut gepoolt | Alter `finally: putconn(conn)` ohne `close=True`; Fix in `backend/main.py:147-196`, `251-306` | Keine Produktionslogs mit conn.closed | Wiederkehrender DB-Fehler bis Restart | Ja | Fake-Test `test_execute_operational_error_discards_connection` | 80% | Beim naechsten Ausfall Exception-Klasse/pgcode und discard logs sichern |
| 2 | Connection-Leak/Pool-Erschoepfung | Pool max 10, alle Pfade nutzen Context-Manager | Kein konkreter Leak gefunden | PoolError/503 | Teilweise | Fake-Test Pool-Erschoepfung | 35% | PoolError-Zaehler/Checkout-Latenz loggen |
| 3 | Fehlerhafter Transaktionszustand | Alter Code gab nach Rollback-Erfolg dieselbe Connection normal zurueck | psycopg2 rollback kann Zustand reinigen, solange Connection gesund | Folgefehler in naechsten Requests | Ja | Rollback-Failure-Test | 45% | Transaktionsstatus bei Return optional messen |
| 4 | Supabase/PgBouncer beendet SSL-Verbindung | Transaction Pooler + langlebiger App-Pool | Keine Supabase-Metriken | SSL/socket closed | Ja | Fake OperationalError | 65% | Supabase Pooler Logs/Metriken vor Restart sichern |
| 5 | Render Netzwerk/DNS | Externes Hosting, Restart hilft | Kein DNS/TLS-Fehlerlog | Connection timeout | Ja | Health-Messung nur kurz | 30% | Vor Restart DNS/TLS/latency erfassen |
| 6 | SSL/Timeout-Problem | Keine Timeouts/Keepalives im alten DSN | `sslmode=require` war vorhanden, wenn keine Query | Haengende/alte Sockets | Ja | DSN-Tests | 55% | Nach Deploy Timeouts und discard count beobachten |
| 7 | Python/Dependency-Inkompatibilitaet | Keine Runtime-/Dependency-Pins | psycopg2 2.9.12 cp314-Wheels; lokale Tests auf 3.13 gruen | Build-/Runtime-Fehler | Nicht typisch | Nicht lokal mit 3.14 getestet | 25% | CI/Render mit explizit gepinnter Version testen |
| 8 | Env-/Deployment-Drift | render.yaml unvollstaendig; Docs sagen Dashboard ist Quelle | Env wurde geprueft | Startfehler/Configfehler | Manchmal | Nicht lokal | 35% | Env-Namen-Checkliste, keine Werte kopieren |
| 9 | Mehrere Worker/prozessseparate Pools | Kein `WEB_CONCURRENCY` im Repo | Start command nutzt plain Uvicorn ohne Workers | Supabase max connections | Ja/teilweise | Nicht getestet | 30% | Render Runtime env/Prozessliste pruefen |
| 10 | Health-Check-Fehlinterpretation | `/health` ist DB-readiness, keine reine liveness | Gibt 503 ohne Detail | Monitoring sieht App down bei DB down | Nein | Health-Tests | 45% | `/health/live` und `/health/ready` separat planen |
| 11 | Externe regionale Stoerung | Render/Supabase EU extern | Kein Status-/Incident-Beleg | Viele Dienste betroffen | Ja | Nicht reproduziert | 20% | Statusseiten/Region vor Restart sichern |
| 12 | Fehlerhafte Query-String-Erweiterung | Alter `+ "?sslmode=require"` | Nur falls DATABASE_URL bereits Query hat | Verbindungsfehler ab Startup | Restart hilft nicht dauerhaft | DSN-Tests | 40% | Produktions-URL-Namen/Parameterform pruefen, keine Werte ausgeben |

## 9. Risikomatrix

| ID | Titel | Kategorie | Severity | Konfidenz | Produktionsauswirkung | Wahrscheinlichkeit | Evidenz | Massnahme | Aufwand | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Defekte Connection im Pool | DB | High | Hoch | Wiederkehrende 503/DB down | Hoch | `backend/main.py:147-196`, `251-306` | umgesetzt | S | sofort |
| F-02 | DSN-Query falsch | Deployment | Medium | Hoch | Startup-/Connect-Fehler | Mittel | `backend/main.py:110-126` | umgesetzt | S | sofort |
| F-03 | Keine Timeouts/Keepalives | DB | Medium | Hoch | Haengende/tote Sockets | Mittel | `backend/main.py:115-122` | umgesetzt | S | sofort |
| F-04 | Runtime nicht gepinnt | Deployment | Medium | Hoch | Nicht reproduzierbare Builds | Mittel | `render.yaml`, `requirements.txt` | pinnen | S-M | Backlog kurzfristig |
| F-05 | test_db.py Production-Risiko | Security/Ops | High | Hoch | Versehentlicher Prod-Zugriff | Mittel | `backend/test_db.py` | TEST_DATABASE_URL erzwingen | S | sofort/Backlog |
| F-06 | Rohe Fehlerdetails | Security | Medium | Hoch | Struktur-/Fehlerleck | Mittel | `backend/main.py` mehrere Endpunkte | maskieren | M | Backlog |
| F-07 | Token im Pfad | Security | Medium | Hoch | Token in Access Logs | Mittel | `backend/main.py:1285-1290` | Body/Header-Design | M | Backlog |
| F-08 | Checkout-Duplikate | Payment | Medium | Mittel | Mehrere Stripe Sessions | Mittel | `backend/main.py:1350-1401` | Idempotency-Key | M | Backlog |
| F-09 | Kein Monitoring | Ops | Medium | Hoch | Spaete Erkennung | Hoch | DEPLOYMENT Monitoring-Abschnitt | Uptime/Alerts | S-M | Backlog |
| F-10 | Docs-Drift JK/Render | Docs/Ops | Low | Hoch | Fehlkonfiguration | Mittel | Deployment/Architektur-Diffs | aktualisieren | S | Backlog |

## 10. Durchgefuehrte Reproduktionen

Reproduktionen erfolgten ausschliesslich mit Fakes/Mocks, nicht gegen Production:

- Gesunde Connection: normaler Commit, Rueckgabe ohne `close=True`.
- Checkout gibt geschlossene Connection: alte Connection verworfen, genau ein zweiter Versuch.
- Zwei geschlossene Connections: kein Endlos-Retry.
- Cursor-Erstellung `InterfaceError`: Rollback-Versuch, Connection verworfen.
- Execute `OperationalError`: Rollback-Versuch, Connection verworfen.
- Commit `OperationalError`: unklarer Commit-Zustand, Connection verworfen, kein Statement-Retry.
- Rollback scheitert: Connection verworfen.
- Pool-Erschoepfung: `PoolError` propagiert kontrolliert.
- Parallel verschachtelte Checkouts: keine doppelte Rueckgabe.
- Health gesund: 200-Shape.
- Health DB-Fehler: 503 ohne interne Detailmeldung.
- Defekte Health-Connection: `close=True`.
- DSN ohne Query, mit Query und mit vorhandenem `sslmode`.
- Pflicht-Env fehlt: sichere Diagnose nur mit Variablennamen.
- Thread-safe Pool-Reset-Hook.
- Zweiter Request nach defekter Connection erhaelt frische Connection.
- Mutierender Vorgang nach unklarem Commit wird nicht blind wiederholt.
- E-Mail-Idempotenz: `email_sent_at` verhindert erneuten Versand.

## 11. Testergebnisse

Ausgefuehrt:

```text
.\backend\.venv\Scripts\python.exe -m py_compile backend\main.py backend\camp_config.py
.\.venv\Scripts\python.exe -m pytest -q
```

Ergebnis:

```text
21 passed in 1.39s
```

Keine Produktionsdatenbank wurde fuer Tests verwendet.

### Begrenzter Production-Health-Test

Ausgefuehrt am 2026-07-21 zwischen 07:57:28Z und 07:57:48Z gegen ausschliesslich:

```text
https://sommercamps.onrender.com/health
```

Ergebnis: 10 von 10 Requests HTTP 200 mit `{"status":"ok","database":"reachable"}`. Latenzen: 304 ms fuer die erste Anfrage, danach 93 bis 115 ms. Keine DNS-/TLS-/Timeout-Fehler beobachtet.

Bewertung: Dieser Test zeigt nur, dass der Endpunkt zum Messzeitpunkt erreichbar war. Er beweist nicht, dass der wiederkehrende Idle-/Pool-Fehler dauerhaft geloest ist.

## 12. Vorgenommene Codeaenderungen

- `backend/main.py`
  - Pflicht-Env-Pruefung mit sicherer Fehlermeldung.
  - DSN-Building per `urllib.parse`.
  - DB-Pool-Min/Max und Connect-Timeout optional per Env steuerbar.
  - TCP-Keepalive-Defaults.
  - Checkout verwirft geschlossene Connections und versucht genau einmal neu.
  - `OperationalError`/`InterfaceError` und fehlgeschlagener Rollback fuehren zu `putconn(close=True)`.
  - Thread-safe `reset_db_pool()` als kontrollierter Hook.
  - Keine pauschalen Retries um mutierende Transaktionen.
- `backend/tests/test_db_reliability.py`
  - 21 Fake-basierte Tests.
- `backend/requirements-dev.txt`
  - Dev-only pytest-Abhaengigkeit.

Neue Produktionsdependencies: keine.  
Migrationen: keine.

## 13. Verbleibende Risiken

- Ohne Produktionslogs bleibt die primaere Ursache "probable", nicht "confirmed".
- Lokale Tests liefen mit Python 3.13.3, nicht mit Render 3.14.3.
- `requirements.txt` ist weiterhin nicht lockbar/reproduzierbar.
- `/health` mischt App-Liveness und DB-Readiness.
- Fehlerdetails in mehreren Responses sind weiterhin zu ausfuehrlich.
- Stripe Checkout kann mehrere Sessions erzeugen.
- `registration_token` im Pfad bleibt ein Logging-Risiko.

## 14. Production-Deployment-Plan

1. Kein DB-Backup erforderlich fuer diesen Patch, da keine Migration und kein DB-Schreibskript.
2. Vor Deployment aktuellen Produktionszustand sichern: `/health`, Render Deploy-ID, letzte Fehlerlogs.
3. Backend deployen.
4. Direkt nach Deploy `/health` pruefen.
5. Einen Admin-Login-Smoke-Test durchfuehren.
6. Einen Registrierungs-Smoke-Test nur mit eindeutig als Test markierten Dummy-Daten und ohne echte Kinderdaten, oder in separater Testumgebung.
7. Logs fuer `db_connection_discarded`, `db_connection_checkout_failed`, `db_transaction_rollback_failed` beobachten.

## 15. Rollback-Plan

1. Render Dashboard: vorherigen erfolgreichen Deploy redeployen.
2. Keine DB-Rollback-Schritte erforderlich, da keine Migration.
3. Nach Rollback `/health` und Admin-Login pruefen.
4. Incident-Dokument mit Zeitpunkten und Log-Auszug aktualisieren.

## 16. Beobachtungsplan nach Deployment

Mindestens 48 Stunden:

- Anzahl 503 auf `/health`.
- Auftreten von `db_connection_discarded`.
- Exception-Klassen und `pgcode`, falls vorhanden.
- Latenz von `/health`.
- Render-Restarts und Cold Starts.
- Supabase Pooler-Status, sofern Dashboarddaten vorhanden.

Wichtig: Ein kurzer erfolgreicher Health-Test beweist nur momentane Erreichbarkeit, nicht das Ausbleiben von Idle-/Pool-Problemen nach Stunden.

## 17. Empfohlene Folgetickets

1. Python-Version explizit pinnen, zum Beispiel `.python-version` oder Render `PYTHON_VERSION`, nach bewusstem Entscheid 3.13.x vs 3.14.x.
2. Reproduzierbare Python-Dependencies: Constraints/Lockfile und CI-Test mit Zielruntime.
3. `backend/test_db.py` absichern oder entfernen; nur `TEST_DATABASE_URL` erlauben.
4. `/health/live` und `/health/ready` einfuehren, bestehenden `/health` kompatibel lassen.
5. Rohe Exception-Details in HTTP-Responses maskieren.
6. Stripe Checkout idempotent machen.
7. `registration_token` aus URL-Pfaden entfernen oder Access-Log-Redaktion konfigurieren.
8. Minimales externes Uptime-Monitoring fuer `/health` einrichten.
9. Runbook beim naechsten Ausfall konsequent ausfuellen.

## Quellen

- Render Python-Versionen: https://render.com/docs/python-version
- Python 3.14.3 Release: https://www.python.org/downloads/release/python-3143/
- psycopg2-binary PyPI: https://pypi.org/project/psycopg2-binary/
- FastAPI PyPI: https://pypi.org/project/fastapi/
- Uvicorn PyPI: https://pypi.org/project/uvicorn/
- PyJWT PyPI: https://pypi.org/project/PyJWT/
- Pydantic PyPI: https://pypi.org/project/pydantic/
- Stripe PyPI: https://pypi.org/project/stripe/
