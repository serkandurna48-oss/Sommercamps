# CampsPilot

Online-Anmeldesystem für Fußball-Feriencamps. Aktuell Single-Tenant für **KSV Baunatal**
(produktiv), im Umbau Richtung Multi-Tenant-fähiger Plattform für weitere Vereine —
**JK Performance Academy** ist als zweiter Kunde in Vorbereitung (Draft-Status).

Details zu Architektur, Konventionen und Roadmap: siehe [`CLAUDE.md`](./CLAUDE.md).

## Status

| Kunde | Status | Details |
|---|---|---|
| KSV Baunatal | Produktiv live | [`docs/customers/ksv.md`](docs/customers/ksv.md) |
| JK Performance Academy | Draft/Preview, kein produktiver Schreibpfad | [`docs/customers/jk-performance.md`](docs/customers/jk-performance.md) |

Wie beide Kunden technisch zusammenhängen (ein Repository, zwei Vercel-Projekte, ein
geteiltes Backend): [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md).

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

Es gibt aktuell **keine automatisierten Tests** (weder Frontend noch Backend) und **keine
CI-Pipeline** — beides ist als offener Punkt in [`TODO.md`](./TODO.md) (T09) erfasst. Prüfungen
laufen bis dahin manuell.

## Weiterführende Dokumentation

| Dokument | Inhalt |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Architektur, Datenfluss, Konventionen, bekannte Bugs, Roadmap |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Supabase/Render/Vercel-Setup, Env-Vars, Backup, Rollback, Kosten |
| [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) | Wie KSV und JK technisch zusammenhängen |
| [`docs/customers/`](docs/customers/) | Kundenkontexte KSV und JK Performance Academy |
| [`TODO.md`](./TODO.md) | Priorisierte offene Aufgaben |
