# CampsPilot

> **Aktueller technischer Stand (28.10.2026):** [CampsPilot SaaS – Betriebs- und Releasezustand](docs/architecture/current-state-2026-10-28.md). Die nachfolgenden Abschnitte dokumentieren teilweise das ältere Legacy-System und dürfen NICHT als Beschreibung der heutigen SaaS-Produktionsarchitektur verwendet werden. Neue Mitarbeitende lesen zuerst den aktuellen Stand.

Online-Anmeldesystem für Fußball-Feriencamps mit einem **produktiven Multi-Tenant-SaaS-Pfad** (`backend_saas/` + `/pilot/[org]`) und separat bestehenden Legacy-Auftritten (`backend/`). **KSV Baunatal** ist im SaaS öffentlich live; **JK Performance Academy** ist dort noch nicht öffentlich freigeschaltet. Details: [aktueller Betriebsstand](docs/architecture/current-state-2026-10-28.md).

Details zu Architektur, Konventionen und Sicherheitspflichten: siehe [`CLAUDE.md`](./CLAUDE.md).

## Status

| Kunde | Status | Details |
|---|---|---|
| KSV Baunatal | Produktiv live | [`docs/customers/ksv.md`](docs/customers/ksv.md) |
| JK Performance Academy | Draft/Preview, kein produktiver Schreibpfad | [`docs/customers/jk-performance.md`](docs/customers/jk-performance.md) |

Wie beide Kunden technisch zusammenhängen (ein Repository, zwei Vercel-Projekte, seit JK-102
zwei vollständig getrennte Backend/DB-Instanzen): [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md).

## Tech-Stack

- **Frontend:** Next.js (App Router) + React + Tailwind CSS + TypeScript, gehostet auf Vercel
- **Backend:** FastAPI (Python) + Uvicorn, gehostet auf Render
- **Datenbank:** Supabase / PostgreSQL
- **E-Mail:** Brevo · **Zahlungen:** Stripe

Exakte Versionen und Datenfluss-Details: [`CLAUDE.md`](./CLAUDE.md#stack--versionen).

## Lokale Einrichtung

### Schnellstart

```powershell
.\start-dev.ps1
```

Startet Backend (`uvicorn --reload`), Frontend (`npm run dev`) und ein Claude-Terminal je in
eigenem Fenster, öffnet anschließend Browser-Tabs für Frontend, API-Docs und Admin.
Voraussetzung: `backend/.venv` und `frontend/node_modules` existieren bereits (siehe unten).

### Manuell

**Backend** (kanonische Python-Umgebung: `backend/.venv`)

```bash
cd backend
python -m venv .venv                          # einmalig
.venv\Scripts\Activate.ps1                     # Windows
pip install -r requirements.txt
uvicorn main:app --reload
# API-Docs: http://localhost:8000/docs
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:3000
```

Env-Vars: `backend/.env` (Vorlage `backend/.env.example`), `frontend/.env.local` (Vorlage
`frontend/.env.local.example`). Um lokal die JK-Vorschau statt KSV zu sehen:
`NEXT_PUBLIC_ACTIVE_CLUB=jk` in `frontend/.env.local` setzen.

## Qualitätsbefehle

Vor jedem Commit/PR lokal grün laufen lassen:

```bash
# Frontend (im Ordner frontend/)
npm run lint
npx tsc --noEmit
npm run build            # einmal mit NEXT_PUBLIC_ACTIVE_CLUB=ksv, einmal mit =jk

# Backend (im Ordner backend/, .venv aktiv)
python -m py_compile main.py camp_config.py
```

**Aktueller Stand:** Frontend-Vitest und Backend-SaaS-Pytest sind vorhanden. Der ältere Workflow `.github/workflows/ci.yml` prüft vor allem das Legacy-System. Der neue Workflow `.github/workflows/ci-saas.yml` ergänzt Frontend-Regressionstests und SaaS-API-/DB-Integrationstests auf Pull Requests mit einer isolierten, kurzlebigen PostgreSQL-CI-Instanz, ohne Produktionsdaten. Lokale DB-Integrationstests benötigen weiterhin einen expliziten Wegwerf-Postgres-Port (`REVIEW_POSTGRES_PORT`). Die aktuellen Release- und QA-Regeln stehen in `docs/architecture/current-state-2026-10-28.md`.

## Weiterführende Dokumentation

| Dokument | Inhalt |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Architektur-Kurzfassung, Konventionen, Sicherheitspflichten, Fallstricke (kanonisch für KI-Assistenten) |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Supabase/Render/Vercel-Setup, Env-Vars, Backup, Rollback, Kosten |
| [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) | Wie KSV und JK technisch zusammenhängen (IST-Zustand) |
| [`docs/customers/`](docs/customers/) | Kundenkontexte KSV und JK Performance Academy |
| [`TODO.md`](./TODO.md) | Priorisierte offene Aufgaben |
| [`.claude/rules/`](.claude/rules/) | Frontend-/Backend-spezifische Code-Konventionen |
| [`docs/archive/`](docs/archive/) | Historische Dokumente (überholte Roadmap, Phase-1-Protokoll) — kein aktueller Stand |
