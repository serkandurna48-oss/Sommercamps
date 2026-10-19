# Lokal entwickeln (L2)

Der neue `start-dev.ps1` startet den SaaS-Pilot mit einer isolierten lokalen
PostgreSQL-Datenbank. Ohne konfigurierte Zielvariablen gelten fest:

| Dienst | Ziel |
|---|---|
| PostgreSQL | `127.0.0.1:55443`, Datenbank `dev_l2`, Benutzer `postgres` |
| Backend | `http://127.0.0.1:8112` |
| Frontend | `http://127.0.0.1:3112/pilot/jk-academy-demo` |

## Einmalig im eigenen Worktree

Python 3.12 oder neuer, Node.js/npm und der lokale PostgreSQL-Launcher
`$env:USERPROFILE\dev\_tools\pg-start.ps1` werden vorausgesetzt.
Der Launcher startet PostgreSQL bei Bedarf. Keine Cloud-Zugangsdaten verwenden.

```powershell
py -3.13 -m venv scripts/dev/.venv
scripts/dev/.venv/Scripts/python.exe -m pip install -r backend_saas/requirements.txt
Push-Location frontend
npm.cmd ci
Pop-Location
powershell -NoProfile -ExecutionPolicy Bypass -File ./start-dev.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File ./start-dev.ps1
```

Keine `.env`, `.env.local`, `.env.development` oder `.env.development.local`
im Frontend dieses Worktrees anlegen: der Starter verweigert damit den Start,
ohne Inhalte zu lesen. `backend_saas/.env` wird weder gelesen noch benötigt.
Backend-Settings werden explizit mit `_env_file=None` erzeugt. Beide Dienste
erhalten eine minimale Umgebung mit lokalen URLs, ohne geerbte Mail-/Auth-Secrets.
Die Umgebung wird bereits vor dem Start der Sprachlaufzeiten bereinigt, damit
auch `NODE_OPTIONS` und `PYTHONPATH` nicht übernommen werden. Vor dem DB-Bootstrap
werden außerdem libpq-Variablen wie `PGHOSTADDR`, `PGSERVICE` und `PGOPTIONS` entfernt.

## Was beim Start passiert

1. Ziel aus `-DatabaseUrl` / `DATABASE_URL` und `-ApiUrl` /
   `NEXT_PUBLIC_SAAS_API_URL` (ersatzweise `NEXT_PUBLIC_API_URL`) validieren
   und groß mit DB-Host anzeigen.
2. PROD vor jeglicher Verbindung sperren. Bekannte Projektkennungen, explizite
   Prod-Namen und unbekannte externe Ziele gelten als PROD. Explizite
   Staging-URLs erzeugen eine Warnung.
3. Freie Ports, lokale Abhängigkeiten und fehlende Frontend-Dotenv-Dateien prüfen.
4. PostgreSQL starten, `dev_l2` bei Bedarf anlegen, Supabase-Kompatibilität
   (`auth.users`, `auth.uid()`, Rolle `authenticated`) lokal bereitstellen.
5. Alle SQL-Dateien aus `supabase/migrations` in Dateireihenfolge unverändert
   anwenden. `public.dev_migrations` speichert Namen und SHA256. Wiederholte
   Starts überspringen bereits angewendete Migrationen. Nachträgliche Änderungen
   an angewendeten Dateien brechen ab. Migrationen und Seed sind eine Transaktion.
6. Synthetische **JK-Demo-Org** und ein veröffentlichtes Demo-Camp idempotent laden.
7. Backend und Frontend im Hintergrund starten, Backend-Health und Frontend-Port
   prüfen. Logs und Prozesskennungen liegen ignoriert unter `scripts/dev/.runtime/`.

Die Kompatibilitätsschicht ist **kein Supabase-Auth-Dienst**. Die öffentliche
Anmeldestrecke ist lokal nutzbar; Admin-Login braucht einen separat eingerichteten
lokalen Auth-Dienst und ist hier nicht eingerichtet. Auth-URLs zeigen ausschließlich
auf Loopback, Schlüssel sind Platzhalter. Es werden keine echten E-Mails versendet.
Der lokale PostgreSQL-Benutzer ist ein Entwicklungs-Superuser, kein Produktionsmodell.

`-DryRun` zeigt ausschließlich Ziel und Plan. Es erzeugt keine Laufzeitdateien,
startet keine Dienste und öffnet keine Netzwerkverbindungen. Auch mit `-DryRun`
bleibt der PROD-Schutz aktiv. Exitcodes: `0` erfolgreich, `1` ungültig/Startfehler,
`2` fehlende PROD-Freigabe. URLs/Passwörter werden nie vollständig protokolliert.

Für die PROD-Freigabe wären **beide** Bedingungen erforderlich:
`ALLOW_PROD_WRITES=yes` und die exakte interaktive Eingabe `PROD`.
Umgeleitete Eingabe oder `-NonInteractive` genügt nicht. Dieser lokale Starter
führt selbst nach Freigabe keine externen Starts, Migrationen oder Seeds aus:
für externe Ziele ist nur die Zielprüfung mit `-DryRun` implementiert.
Tatsächliche Starts akzeptieren ausschließlich den oben genannten DB-Endpunkt
ohne Passwort/Query und die feste lokale API-URL. Alternative lokale URLs lassen
sich mit `-DryRun` prüfen, werden aber nicht stillschweigend als Startziel ignoriert.

## Beenden und prüfen

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/test-start-dev.ps1
scripts/dev/.venv/Scripts/python.exe scripts/dev/test-isolation.py
scripts/dev/.venv/Scripts/python.exe scripts/dev/test-bootstrap.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/test-process.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/test-stop-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/test-preflight.ps1
scripts/dev/.venv/Scripts/python.exe scripts/dev/test-local.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/stop-local.ps1
```

Der erste Test verwendet ausschließlich URL-Strings und einen temporären
Start-Dummy. Der Integrationstest braucht den laufenden lokalen Stack und prüft
Schema, Seed, API, CORS, eine synthetische Anmeldung mit DB-Nachweis/Cleanup und
Frontend. Die weiteren Tests prüfen geerbte Konfiguration, Prozess-Isolation,
Dotenv-/Port-Abbruch und Eigentumsprüfung beim Stoppen.
Keine Tests verbinden sich mit Cloud-Zielen.
Der Stopper prüft PID **und Startzeit** und beendet nur zugehörige Prozessbäume.
PostgreSQL bleibt für andere Sessions aktiv. Bei belegten Ports wird nichts beendet.

Für parallele Aufträge gilt vor Server-/Build-/Browserläufen die gemeinsame
Lockdatei `C:\Users\serka\dev\_reports\LOCK-lauf.txt` aus dem Auftrag.

## Rollback

`start-dev.legacy.ps1` ist die bytegleiche vorherige Version. Sie ist **ungeschützt**
und kann vorhandene Cloud-Konfiguration laden. Nicht für lokale Tests verwenden.
Historische Optionen waren `-Saas` und `-Demo`; sie gehören zum Altstarter.
Nur nach bewusster manueller Prüfung einer vollständig isolierten Umgebung wäre
`powershell -File ./start-dev.legacy.ps1 -Saas` die frühere Bedienung.
Der sichere Rollback einer Änderung erfolgt per Git-Revert; die Legacy-Datei
niemals unbemerkt als Standardstarter zurückkopieren.
