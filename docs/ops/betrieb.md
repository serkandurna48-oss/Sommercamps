# Betrieb — CampsPilot SaaS Backend (`backend_saas/`)

> S4-Bericht, 18.10.2026. Belegt = aus Code/Konfig abgelesen oder lokal geprüft.
> Ungeprüft = aus Dokumentation/Annahme, ohne Live-Zugriff auf Render/Supabase.

---

## 1. Start und Hochfahren

### Lokale Entwicklung

```powershell
# Im Hauptordner:
.\start-dev.ps1 -Saas
# → startet backend_saas (uvicorn :8001) + frontend (:3000),
#   wartet auf GET /health 200 bevor der Browser geöffnet wird.
```

Manuell:
```powershell
cd backend_saas
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Produktionsstart (Render)

Render führt aus: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Startreihenfolge** (belegt aus `main.py` + `db.py`):
1. `get_settings()` wird beim Importieren ausgewertet — fehlt eine Pflicht-Env-Var, schlägt der
   Start mit `RuntimeError: ... missing or invalid configuration` fehl, bevor der erste Request
   eingehen kann.
2. `lifespan()`: `db.init_pool()` öffnet den psycopg2-Connection-Pool (min=1, max=10).
3. Startlog: `<APP_NAME> started (env=<APP_ENV>)`
4. `db.init_pool()` loggt: `Database connection pool initialized`
5. Render-Healthcheck ruft `/health` ab (siehe Abschnitt 2).

**Kaltstart auf Render Free Plan** (ungeprüft, aus Render-Doku):
- Free-Tier-Services schlafen nach ~15 min Inaktivität ein.
- Kaltstart dauert ca. 30–60 Sek. (Python-Process-Start + pip-Cache-Install + Pool-Init).
- `start-dev.ps1 -Saas` wartet bereits auf `/health 200` — dasselbe Muster für jeden
  Integrations-Script empfohlen.

---

## 2. Healthcheck

**Endpunkt:** `GET /health`

| Zustand | HTTP | Body |
|---|---|---|
| DB erreichbar | 200 | `{"status":"ok","database":"ok","service":"campspilot-saas-api","version":"0.1.0"}` |
| DB nicht erreichbar | 503 | `{"status":"error","database":"unreachable","service":"campspilot-saas-api","version":"0.1.0"}` |

Führt `SELECT 1` aus. Keine PII, kein Auth nötig.

**Render-Konfiguration:** `healthCheckPath: /health` ist in `render.yaml` eingetragen (S4,
18.10.2026). Davor fehlte der Eintrag — Render prüfte `/` (404), was zur Folge hat, dass Render
den Service als „unhealthy" eingestuft hätte.

---

## 3. Erforderliche Konfiguration (nur Namen, nie Werte)

Quelle: `backend_saas/app/config.py`. Pflichtfelder ohne Default schlagen beim Start fehl.

| Env-Var | Pflicht | Default | Zweck |
|---|---|---|---|
| `DATABASE_URL` | ✅ | – | Supabase Transaction Pooler (Port 6543, IPv4). Format: `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/<db>` |
| `SUPABASE_URL` | ✅ | – | Supabase-Projekt-URL für Auth-Verifikation |
| `SUPABASE_ANON_KEY` | ✅ | – | Für `GET /auth/v1/user` (Token-Verifikation) |
| `SUPABASE_SERVICE_ROLE_KEY` | – | leer | Nur für org_admin-Zuweisung per E-Mail; fehlt → 503 nur auf diesem Endpunkt |
| `APP_ENV` | – | `development` | In Startlog und ggf. Fehlerseiten sichtbar |
| `APP_NAME` | – | `CampsPilot SaaS API` | In Startlog |
| `LOG_LEVEL` | – | `INFO` | Python-Logging-Level |
| `CORS_ORIGINS_EXTRA` | – | leer | Kommaseparierte Zusatz-Origins (Vercel-URL) |

**Veraltete Vars in render.yaml** (belegt): `ADMIN_PASSWORD` und `JWT_SECRET` sind in
`render.yaml` noch aufgeführt, aber in `config.py` nicht mehr vorhanden — die alte
Passwort/JWT-Authentifizierung ist durch Supabase Auth ersetzt. Diese Vars können auf Render
entfernt werden, falls sie gesetzt sind.

**Lokale Entwicklung:** Kopie von `backend_saas/.env.example` nach `backend_saas/.env` (Datei
existiert noch nicht im Repo, ungeprüft — ggf. Vorlage anlegen).

---

## 4. Fehlerlogs — was geloggt wird

Logging-Framework: Python `logging`, konfiguriert mit `LOG_LEVEL` (Default `INFO`).

| Log-Eintrag | Level | Quelle | Bedeutung |
|---|---|---|---|
| `<APP_NAME> started (env=<APP_ENV>)` | INFO | `main.py lifespan` | Normaler Start |
| `Database connection pool initialized` | INFO | `db.init_pool` | Pool bereit |
| `DATABASE_URL uses Supabase's direct-connection host (db.*.supabase.co)…` | WARNING | `db._warn_if_ipv6_only_supabase_host` | Falscher Host-Typ → IPv6-Fehler auf Render möglich |
| `Health check failed: database unreachable` | ERROR (exception) | `main.py /health` | DB nicht erreichbar; full stack trace folgt |
| `Database connection pool closed` | INFO | `db.close_pool` | Normaler Shutdown |

**Was NICHT geloggt wird** (DSGVO-Schutz, belegt aus Code):
- Kein Kinder-PII in Logs (kein allgemeines Request-Logging aktiviert)
- Health-Fehler loggen nur die Exception, nicht die `DATABASE_URL`
- `SupabaseAuthError` wird geworfen aber nicht hier geloggt — `auth_deps.py` wandelt sie in 401 um

**Ausfall erkennen:**
1. Render Dashboard → Service → Logs: nach `Health check failed` oder `started` suchen.
2. Kein `initialized`-Log nach `started` → DB-Verbindungsproblem beim Start.
3. Wiederholte WARNING `direct-connection host` → `DATABASE_URL` muss auf Transaction-Pooler-Host wechseln.

---

## 5. Deploymentkonfiguration `render.yaml`

Datei: `backend_saas/render.yaml`

Wichtige Einstellungen:
- `plan: free` — kostenlos, aber Kaltstart und keine garantierte Verfügbarkeit
- `region: frankfurt` — physisch nah am Supabase EU-Projekt
- `healthCheckPath: /health` — seit 18.10.2026; davor fehlend
- `startCommand`: ohne `--reload` (Production)
- Alle `sync: false`-Vars müssen manuell im Render Dashboard gesetzt werden

**Render erkennt `render.yaml` nur im Root des Repos** (belegt aus Kommentar in der Datei).
Aktuell wird die Datei nur als Referenz/Dokumentation genutzt; Render-Deployment ist manuell
konfiguriert. Für Blueprint-Nutzung müsste ein repo-root `render.yaml` mit `rootDir:
backend_saas` verweisen.

---

## 6. Backup und Wiederherstellung

### Was Supabase bietet (ungeprüft, aus Supabase-Doku)

| Plan | PITR | Snapshot-Retention | Notizen |
|---|---|---|---|
| Free | Nein | 1 Tages-Snapshot (nicht immer verfügbar) | Kein zuverlässiges Backup |
| Pro | 7 Tage PITR | 7 Tage | Empfohlen für Produktion |

Das Supabase-Projekt „CampsPilot SaaS" (ref `wkmckfbzhmihyfwiekct`) läuft aktuell auf
**unbekanntem Plan** — Backup-Status **ungeprüft** (kein Zugriff auf Supabase Dashboard in
dieser Session).

### Was im Repo dokumentiert ist

- Kein explizites Backup-Skript für `backend_saas/` im Repo.
- `backend/DEPLOYMENT.md` beschreibt Backup/Restore für das KSV-Supabase-Projekt — dieses
  Muster (Supabase Dashboard → Database → Backups + `pg_dump` bei Bedarf) wäre auf
  `backend_saas/` übertragbar.

### Wiederherstellung mit lokaler Test-DB

Eine isolierte Wiederherstellung war in dieser Session **nicht möglich** (kein Zugriff auf
Supabase-Dump, keine lokale Supabase-Instanz konfiguriert). Vorgehen wäre:

```powershell
# Voraussetzung: Supabase CLI installiert, lokales Supabase-Projekt initialisiert
supabase start                          # startet lokale DB
supabase db restore --local <dump.sql>  # Dump einspielen
# dann: DATABASE_URL auf lokalen Port setzen und backend_saas starten
```

**Blockade:** Supabase CLI und lokales Projekt fehlen im aktuellen Setup — als offener Punkt
dokumentiert.

---

## 7. Offene Punkte

| Punkt | Priorität | Wer |
|---|---|---|
| Backup-Plan für Supabase-Projekt prüfen (Free vs. Pro) | Hoch | Serkan (Supabase Dashboard) |
| `ADMIN_PASSWORD` + `JWT_SECRET` aus Render-Dashboard entfernen (veraltet) | Mittel | Serkan |
| `backend_saas/.env.example` anlegen (Vorlage für neue Entwickler) | Niedrig | S4 oder S1 |
| Lokale Supabase-Instanz für isolierte Tests aufsetzen | Niedrig | S3/S5 (Smoke-Test-Spur) |
