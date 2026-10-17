# CLAUDE.md — CampsPilot

> Kompakte Projektsteuerungsdatei für KI-Assistenten. Bei Widersprüchen zum Code gilt: **Code
> schlägt dieses Dokument** — dann bitte hier updaten. Ausführliche Hintergründe stehen in den
> verlinkten Dokumenten unter `docs/`, nicht hier.
>
> **Kanonisch für alle Agenten/Tools ist diese Datei.** `AGENTS.md` ist nur eine Weiterleitung
> hierher (für Tools, die per Konvention `AGENTS.md` statt `CLAUDE.md` lesen).

---

## Projektüberblick & aktueller Kurs

CampsPilot ist ein Online-Anmeldesystem für Fußball-Feriencamps. **KSV Baunatal** ist der
erste, produktive Kunde (`backend/` + `frontend/`, eigenes Supabase-Projekt). **JK Performance
Academy** ist der zweite Kunde — aktuell auf **isolierter Einzel-Infrastruktur** (eigenes
Supabase-Projekt, eigener Render-Service `sommercamps-1`, dieselbe `backend/`-Codebase wie KSV,
siehe [`docs/customers/jk-performance.md`](docs/customers/jk-performance.md)) mit einem ersten
echten Schreibpfad (Trainingsanfragen, CP-JK-101).

**Zielarchitektur (verbindlich, Stand CP-S409B): Shared-Multi-Tenant-SaaS.** CampsPilot wird
als eigenständiges, paralleles System weitergebaut (`backend_saas/` + eigenes
Supabase-Projekt „CampsPilot SaaS" + eigenes Render-Deployment) mit Shared-Schema
(`organizations` → `camps` → `camp_registrations`) statt Infrastruktur-Isolation pro Kunde.
Ein erster funktionierender Staging-Pilot läuft bereits gegen die echte Cloud-DB
(`frontend/app/pilot/[org]/`, CP-S408). **Source of Truth für die Zielarchitektur:**
[`docs/saas/architecture.md`](docs/saas/architecture.md) und
[`docs/saas/migration-strategy.md`](docs/saas/migration-strategy.md).

Die isolierte Pro-Kunde-Infrastruktur aus JK-102 (technischer IST-Zustand:
[`docs/architecture/system-overview.md`](docs/architecture/system-overview.md)) ist damit ein
**Übergangszustand, kein Zielbild**: JK läuft dort produktiv (inkl. echter
Trainingsanfragen) — **nicht anfassen**, bis eine bewusste Migration nach `backend_saas/`
entschieden und geplant ist (siehe `docs/saas/migration-strategy.md`). KSV Baunatal bleibt
unabhängig davon vorerst in `backend/` + seinem bestehenden Supabase-Projekt; eine
KSV-Migration ist weiterhin ein separater, späterer Schritt. Die frühere Einschätzung, die
Shared-Schema-Vision sei überholt (siehe
[`docs/archive/multi-tenant-roadmap-legacy.md`](docs/archive/multi-tenant-roadmap-legacy.md)),
ist mit dieser Entscheidung selbst überholt — das Archiv-Dokument beschreibt weiterhin
korrekt den *damaligen* Ansatz, nicht mehr den aktuellen Stand seiner eigenen Gültigkeit.

**Produktionsstatus:** KSV Baunatal läuft live. Änderungen dürfen den Betrieb nicht
unterbrechen. Datenschutz ist kritisch — das System verarbeitet Kinderdaten (DSGVO Art. 9).

---

## Stack & Versionen

| Komponente | Technologie | Version | Hosting |
|---|---|---|---|
| Frontend | Next.js (App Router) | 16.2.4 | Vercel |
| UI | React | 19.2.4 | — |
| Styling | Tailwind CSS | 4.x | — |
| Language | TypeScript | 5.x | — |
| Backend | FastAPI + Uvicorn | ≥ 0.115 / ≥ 0.29 | Render (Frankfurt) |
| Backend Language | Python | 3.x | — |
| DB Client | psycopg2-binary | ≥ 2.9.10 | — |
| Validation | Pydantic v2 | ≥ 2.9.0 | — |
| Auth | PyJWT (HS256) | ≥ 2.8.0 | — |
| Database | Supabase / PostgreSQL | — | Supabase (EU) — je Kunde ein Projekt (`backend/`, JK-102) **plus** ein separates „CampsPilot SaaS"-Projekt für die Zielarchitektur (`backend_saas/`) |
| E-Mail | Brevo (API v3) | via requests | — |
| Zahlungen | Stripe (Checkout + Webhook) | ≥ 8.0.0 | — |

Frontend-/Backend-spezifische Code-Konventionen liegen nicht hier, sondern in
[`.claude/rules/frontend.md`](.claude/rules/frontend.md) und
[`.claude/rules/backend.md`](.claude/rules/backend.md).

---

## Architektur (Kurzfassung)

```
Browser → Next.js Frontend (Vercel, Club-Auswahl via NEXT_PUBLIC_ACTIVE_CLUB zur Build-Zeit)
              ↓ fetch POST /registrations (KSV) bzw. POST /inquiries (JK, CP-JK-101)
         FastAPI Backend (Render — seit JK-102 EIN Service PRO Kunde, nicht mehr geteilt)
              ↓ psycopg2 (Transaction Pooler Port 6543, SSL)
         Supabase PostgreSQL (seit JK-102 EIN Projekt PRO Kunde)

Stripe → POST /stripe/webhook → Signatur-Verifikation + DB-Update → FastAPI Backend
```

KSV und JK teilen sich **dieselbe Codebase** (`backend/` + `frontend/`), aber seit JK-102
**keine** Infrastruktur mehr (kein gemeinsames Backend, keine gemeinsame DB). Details:
[`docs/architecture/system-overview.md`](docs/architecture/system-overview.md).

**Komplett getrennt davon: `backend_saas/` + `frontend/app/pilot/[org]/`.** Eigene Codebase,
eigenes Supabase-Projekt, eigenes Render-Deployment, eigene Env-Var-Namespaces
(`NEXT_PUBLIC_SAAS_API_URL` statt `NEXT_PUBLIC_API_URL`). Das ist die Zielarchitektur, nicht
Teil des obigen KSV/JK-Diagramms. Details: [`docs/saas/architecture.md`](docs/saas/architecture.md).

**Auth-Modell:** Ein `ADMIN_PASSWORD` pro Kunde/Backend-Instanz (Env-Var auf Render). Login via
`POST /admin/login` → JWT (HS256, 24h TTL), Header `Authorization: Bearer ...`.

**DB-Schema (Kerntabelle `camp_registrations`):** wichtigste Spalten `id` (intern),
`registration_token` (öffentlich, für Payment-Links/E-Mails), `status`, `payment_status`,
`stripe_session_id`, `email_sent_at` (Idempotenz-Guard), `photo_permission`
(DSGVO-Einwilligung). Kein `organization_id`/`club_id` — die Kunden-Trennung ist
Infrastruktur-Isolation, kein Multi-Tenant-Datenmodell.

**Row Level Security (`backend/`):** Public INSERT erlaubt; SELECT/UPDATE nur über
Service-Role-Key (Backend) — kein Browser-Direktzugriff auf Daten.

**Anderes Schema in `backend_saas/`:** Die Zielarchitektur hat ein eigenes,
`organization_id`-bewusstes `camp_registrations`-Schema (`organizations` → `camps` →
`camp_registrations`) im separaten CampsPilot-SaaS-Supabase-Projekt — das ist **keine**
Migration der obigen KSV/JK-Tabelle, sondern ein komplett neues Schema. Details:
[`docs/saas/architecture.md`](docs/saas/architecture.md#43-camp_registrations). RLS ist dort
bereits aktiviert, aber noch ohne Policies (Schutz aktuell rein applikatorisch über
`organization_id`-Filter).

---

## Wichtige Konventionen

- **Kommentare:** Englisch im Code, Deutsch in CLAUDE.md/TODO.md/Commit-Messages
- **Migrations:** immer `IF NOT EXISTS`/`IF EXISTS`-Guards, idempotent; vor riskanten
  Migrationen Backup ziehen (siehe [`DEPLOYMENT.md`](DEPLOYMENT.md#backup--restore))
- **Nichts committen ohne Bestätigung** des Entwicklers
- **Ein Thema, ein Commit** — keine Massen-Refactorings; **keine direkte Arbeit auf `main`**
- **Ein klarer Auftrag/ein Issue pro Branch** — kein Sammel-Branch für mehrere unabhängige Themen
- **Vor jedem Merge beide Club-Konfigurationen prüfen** (`NEXT_PUBLIC_ACTIVE_CLUB` unset/`ksv`
  **und** `jk`) — geteilter Code kann Regressionen auf der jeweils anderen Seite verursachen.
  Dafür gibt es den Subagenten `club-regression-check`
  ([`.claude/agents/club-regression-check.md`](.claude/agents/club-regression-check.md)).
- **DB-Migrationen und neue Dependencies im PR ausdrücklich melden**, nicht stillschweigend
  mitschleifen (siehe [`.github/pull_request_template.md`](.github/pull_request_template.md))
- **Club-spezifische Werte** (Name, Preise, Kontakt, Texte) gehören in
  `frontend/app/lib/clubConfig*.tsx` bzw. Backend-Env-Vars (`CLUB_NAME`, `CLUB_SUBTITLE`,
  `CAMP_YEAR`, ...) — nie als Literal in Komponenten/Routen
- **API-Grundregeln:** alle Admin-Endpunkte verlangen `Authorization: Bearer <jwt>`,
  ausschließlich parameterisierte Queries, `registration_token` (nie `id`) als öffentlicher
  Identifier, Stripe-Webhook immer signaturgeprüft und idempotent

---

## Sicherheitspflichten (DSGVO!)

- Das System verarbeitet **Kinderdaten** (Vorname, Nachname, Geburtsdatum, Allergien)
- Allergien fallen unter Art. 9 DSGVO (besondere Kategorien) → besondere Sorgfalt
- Keine Kinderdaten in Logs ausgeben; keine Daten an Dritte ohne explizite Rechtsgrundlage
- Bei DB-Schema-Änderungen: Auswirkung auf Datenschutzerklärung prüfen
- **Keine produktiven Datenbanken für Tests verwenden** — niemals gegen die echte, in
  `DATABASE_URL` konfigurierte Produktions-DB testen (betrifft `backend/test_db.py` und
  `backend_saas/tests/test_db.py` gleichermaßen)

Bugs/Hardcoded-Strings-Historie von `backend/`: [`TODO.md`](TODO.md). Die frühere
Shared-Schema-Roadmap (Phasen 1–5, Stand vor JK-102) steht — mit Vorbehalt laut obigem
Abschnitt "Projektüberblick & aktueller Kurs" — in
[`docs/archive/multi-tenant-roadmap-legacy.md`](docs/archive/multi-tenant-roadmap-legacy.md).
Der aktuelle Bauplan für die Zielarchitektur ist nicht diese alte Roadmap, sondern
[`docs/saas/architecture.md`](docs/saas/architecture.md) +
[`docs/saas/migration-strategy.md`](docs/saas/migration-strategy.md) +
`backend_saas/README.md` (dortiger Implementierungsstand, laufend aktualisiert).

---

## Lokale Entwicklung

Kurzreferenz — vollständige Anleitung: [`README.md`](README.md#lokale-einrichtung),
Env-Var-Referenz: [`DEPLOYMENT.md`](DEPLOYMENT.md).

```bash
cd backend && pip install -r requirements.txt && uvicorn main:app --reload   # http://localhost:8000/docs
cd frontend && npm install && npm run dev                                   # http://localhost:3000
```

---

## Nicht-offensichtliche Fallstricke

1. **Stripe-Webhook muss Raw Body erhalten** — kein JSON-Parsing vor Signatur-Verifikation
   (`await request.body()` in `main.py` — nicht ändern).
2. **Supabase Transaction Pooler (Port 6543)**: psycopg2 mit `sslmode=require`. Session Pooler
   (Port 5432) funktioniert nicht mit prepared statements.
3. **`registration_token` vs. `id`**: `id` ist intern, `registration_token` ist der öffentliche
   Identifier. Nie `id` in URLs oder E-Mails exponieren.
4. **`email_sent_at` als Idempotenz-Guard**: Mailversand-Fehler brechen die Registrierung nicht
   ab (best-effort).
5. **DB-Constraint vs. Pydantic**: Validierung erfolgt doppelt. Bei CheckViolation liefert
   `CONSTRAINT_MESSAGES` lesbare deutsche Fehlermeldungen.
6. **CORS**: `localhost:3000` immer erlaubt, Produktions-Frontend-URL per `CORS_ORIGINS_EXTRA`.
7. **Zwei getrennte Backends seit JK-102**: `ksv-baunatal-backend` und `sommercamps-1` laufen
   von derselben `main.py`, aber mit eigenen Env-Vars/DBs — ein Fix für KSV muss ggf. auch im
   JK-Service deployed werden und umgekehrt, sonst laufen beide Seiten auseinander.
8. **`backend_saas/` ist ein drittes, komplett unabhängiges System** — nicht mit den beiden
   obigen verwechseln. Eigene Codebase, eigenes Supabase-Projekt, eigener Render-Service,
   eigene Tests (`backend_saas/tests/`, `venv/` lokal, nicht das Root-`venv/`). Ein Fix in
   `backend/main.py` betrifft `backend_saas/` nie, und umgekehrt.

---

## Weiterführende Dokumentation

| Thema | Datei |
|---|---|
| Technischer IST-Zustand KSV/JK-Trennung (`backend/`, Übergangszustand) | [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) |
| Kundenkontext KSV | [`docs/customers/ksv.md`](docs/customers/ksv.md) |
| Kundenkontext JK | [`docs/customers/jk-performance.md`](docs/customers/jk-performance.md) |
| **Zielarchitektur Shared-Multi-Tenant-SaaS (verbindlich)** | [`docs/saas/architecture.md`](docs/saas/architecture.md) |
| **Migrationsstrategie in die Zielarchitektur** | [`docs/saas/migration-strategy.md`](docs/saas/migration-strategy.md) |
| Implementierungsstand `backend_saas/` (laufend aktualisiert) | [`backend_saas/README.md`](backend_saas/README.md) |
| Deployment, Env-Vars, Backup, Rollback, Kosten (`backend/`) | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Priorisierte offene Aufgaben (`backend/`) | [`TODO.md`](TODO.md) |
| Frontend-Konventionen | [`.claude/rules/frontend.md`](.claude/rules/frontend.md) |
| Backend-Konventionen | [`.claude/rules/backend.md`](.claude/rules/backend.md) |
| Dual-Club-Regressionscheck (Subagent, `backend/`) | [`.claude/agents/club-regression-check.md`](.claude/agents/club-regression-check.md) |
| Neuen Verein onboarden (Subagent, Plan-only, `backend/`-Ansatz — vor Nutzung gegen die neue Zielarchitektur prüfen) | [`.claude/agents/customer-onboarding.md`](.claude/agents/customer-onboarding.md) |
| Frühere Shared-Schema-Roadmap, Stand vor JK-102 (historischer Ansatz — inhaltlich wieder relevant als Vorstufe der jetzigen Zielarchitektur, siehe Vorbehalt oben) | [`docs/archive/multi-tenant-roadmap-legacy.md`](docs/archive/multi-tenant-roadmap-legacy.md) |
| Archiviertes Phase-1-Abschlussprotokoll | [`docs/archive/session-notes-phase1-2026-05-19.md`](docs/archive/session-notes-phase1-2026-05-19.md) |
