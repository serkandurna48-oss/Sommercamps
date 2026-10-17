# Lokale Dev-Umgebung — Spickzettel

> Drei komplett getrennte Systeme leben in diesem einen Ordner. Das ist Absicht (siehe
> `CLAUDE.md`), aber lokal leicht zu verwechseln. Diese Datei ist die feste Referenz —
> nicht aus dem Gedächtnis tippen, hier nachschlagen.

## Die 3 Systeme auf einen Blick

| | KSV Baunatal | JK Performance Academy | CampsPilot SaaS (Pilot) |
|---|---|---|---|
| Ordner Backend | `backend/` | `backend/` (**identisch mit KSV**) | `backend_saas/` |
| Ordner Frontend | `frontend/` | `frontend/` (**identisch mit KSV**) | `frontend/app/pilot/[org]/` |
| Unterscheidung | Standard | `NEXT_PUBLIC_ACTIVE_CLUB=jk` in `frontend/.env.local` | eigener Backend-Ordner + `/pilot/<slug>`-Route |
| Backend-App-Pfad | `main:app` (flach, kein Unterordner) | `main:app` | `app.main:app` (liegt im `app/`-Package) |
| Venv-Ordner | `backend/.venv` | dasselbe | `backend_saas/venv` (**kein Punkt davor!**) |
| Port Backend | 8000 | 8000 | 8001 |
| Status | produktiv | produktiv (isolierte Infra) | Staging-Pilot, neue Zielarchitektur |

**Erkennungsmerkmal im Terminal-Prompt:** `(.venv)` = du bist in `backend/` · `(venv)` = du bist in `backend_saas/`. Vor jedem `uvicorn`-Befehl kurz auf den Prompt schauen.

## Am einfachsten: das Start-Skript nutzen, nichts von Hand tippen

```powershell
.\start-dev.ps1          # KSV/JK-Backend (:8000) + Frontend (:3000) + Claude
.\start-dev.ps1 -Saas    # zusätzlich backend_saas (:8001) + öffnet /pilot/ksv-baunatal
```

Öffnet automatisch die richtigen Terminals mit beschrifteten Fenstertiteln und die richtigen
Browser-Tabs. Das vermeidet genau die Verwechslung von vorhin (falscher Ordner/falscher
Modulpfad).

## Manuell starten (falls nötig)

**backend/ (KSV + JK, Port 8000):**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

**backend_saas/ (SaaS-Pilot, Port 8001):**
```powershell
cd backend_saas
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8001
```

**frontend/ (bedient alle drei, Port 3000):**
```powershell
cd frontend
npm run dev
```
Welchen Kunden/Modus das Frontend zeigt, hängt nur von `frontend/.env.local` ab
(`NEXT_PUBLIC_ACTIVE_CLUB`, `NEXT_PUBLIC_SAAS_API_URL`) — nicht vom Backend-Ordner.

## Typische Fehler → schnelle Diagnose

| Fehler | Ursache | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'app'` | Befehl `uvicorn app.main:app` im **falschen** Ordner (`backend/` statt `backend_saas/`) ausgeführt | Prompt prüfen: `(.venv)` → `uvicorn main:app --reload` (ohne `app.`) |
| `password authentication failed` beim Start von `backend_saas` | Meist ein hängender Reloader-Prozess von einem vorherigen fehlgeschlagenen Start (WatchFiles startet nach Absturz nicht automatisch neu) | Terminal mit `Strg+C` stoppen, `uvicorn app.main:app --reload --port 8001` neu starten |
| Frontend zeigt falschen Kunden (KSV statt JK oder umgekehrt) | `NEXT_PUBLIC_ACTIVE_CLUB` in `frontend/.env.local` steht auf dem falschen Wert | Wert ändern, `npm run dev` neu starten (Next.js liest `NEXT_PUBLIC_*` nur beim (Neu-)Start) |
| Pilot-Flow (`/pilot/<org>`) lädt keine Daten | `backend_saas` läuft nicht, oder `NEXT_PUBLIC_SAAS_API_URL` fehlt/zeigt auf falschen Port | `backend_saas` auf :8001 starten, `.env.local` prüfen |
