# CLAUDE.md — Sommercamp Anmeldesystem

> Dieses Dokument ist die Single Source of Truth für KI-Assistenten und neue Entwickler.
> Bei Widersprüchen zum Code gilt: **Code schlägt dieses Dokument** — dann bitte hier updaten.

---

## Projektübersicht

Online-Anmeldesystem für Fußball-Feriencamps. Aktuell Single-Tenant für **KSV Baunatal**,
wird zu einem **Multi-Tenant SaaS** umgebaut (mehrere Vereine auf derselben Plattform).

**Zielarchitektur:** Shared DB / Shared Schema + Row Level Security in Supabase.
Stripe Connect (Express) für Auszahlungen pro Verein.
Routing: Path-basiert (`/[org-slug]/...`) für MVP, Subdomain später.

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
| Database | Supabase / PostgreSQL | — | Supabase (EU) |
| E-Mail | Brevo (API v3) | via requests | — |
| Zahlungen | Stripe (Checkout + Webhook) | ≥ 8.0.0 | — |

---

## Verzeichnisstruktur

```
Sommercamps/
├── CLAUDE.md                 ← dieses Dokument
├── DEPLOYMENT.md             ← Schritt-für-Schritt Deployment-Anleitung
├── TODO.md                   ← Priorisierte Aufgabenliste (Phase 1+)
├── start-dev.ps1             ← Windows-Skript: Backend + Frontend starten
│
├── backend/
│   ├── main.py               ← FastAPI-Monolith (alle Routes, Models, E-Mail-Logic)
│   ├── schema.sql            ← Initiales DB-Schema (einmalig in Supabase ausführen)
│   ├── migration_phase1.sql  ← +registration_token, +email_sent_at, +stripe_session_id
│   ├── migration_phase2.sql  ← +photo_permission, +paid_at, 'cancelled' payment_status
│   ├── migration_phase3.sql  ← Sicherheits-Migration (dupliziert stripe_session_id; IF NOT EXISTS)
│   ├── migration_jersey_sizes.sql ← Constraint-Update für neue Trikotnummern-Werte
│   ├── requirements.txt      ← Python-Abhängigkeiten
│   ├── render.yaml           ← Render.com Deployment-Config (⚠ ADMIN_API_KEY veraltet)
│   ├── .env                  ← Lokale Secrets (nie ins Repo!)
│   ├── .env.example          ← Template ohne Secrets (im Repo)
│   └── test_db.py            ← Minimaler DB-Verbindungstest
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx          ← Landing Page: Hero, Highlights, Termine, Formular, FAQ, Footer
│   │   ├── layout.tsx        ← Root Layout, Vercel Analytics
│   │   ├── globals.css       ← Tailwind-Basis
│   │   ├── admin/
│   │   │   └── page.tsx      ← Admin-Dashboard: Login, Tabelle, Zahlungsstatus, CSV-Export
│   │   ├── components/
│   │   │   ├── ClubLogo.tsx          ← SVG-Logo (KSV-spezifisch)
│   │   │   └── RegistrationForm.tsx  ← Formular, Validierung, Bestätigungsansicht, Stripe-Button
│   │   ├── datenschutz/
│   │   │   └── page.tsx      ← DSGVO-Datenschutzerklärung (hardcodiert KSV-spezifisch)
│   │   ├── impressum/
│   │   │   └── page.tsx      ← Impressum (hardcodiert KSV-spezifisch)
│   │   └── lib/
│   │       ├── config.ts     ← bankPurpose()-Helper (wird nicht mehr für API-Pfad genutzt)
│   │       └── formatDate.ts ← Datum-Formatter für Admin-Tabelle
│   ├── .env.local            ← Lokale Vars (nie ins Repo!)
│   ├── .env.local.example    ← Template (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_STRIPE_ENABLED)
│   └── package.json
│
└── Doku/
    └── Abschluss_Sommercamp_Phase2.docx  ← Projektdokumentation Phase 2
```

---

## Architektur

### Datenfluss

```
Browser → Next.js Frontend (Vercel)
              ↓ fetch POST /registrations
         FastAPI Backend (Render)
              ↓ psycopg2 (Transaction Pooler Port 6543, SSL)
         Supabase PostgreSQL
              ↑ Service-Role-Key (umgeht RLS)

Stripe → POST /stripe/webhook
              ↓ signature verify + DB update
         FastAPI Backend
```

### Auth-Modell (Single-Tenant, Stand heute)

- Ein globales `ADMIN_PASSWORD` (Env-Var auf Render)
- Login via `POST /admin/login` → JWT (HS256, 24h TTL)
- JWT im `Authorization: Bearer ...` Header bei allen Admin-Endpunkten
- Token im `localStorage` des Browsers gespeichert

### DB-Schema (Kerntabelle)

`camp_registrations` — einzige Tabelle, enthält alle Anmeldungen.
Für Multi-Tenant muss hier eine `organization_id` FK ergänzt werden.

Wichtige Spalten:
- `id` — UUID, intern
- `registration_token` — UUID, öffentlich (Payment-Links, E-Mail-Bestätigung)
- `status` — `registered | confirmed | cancelled | waitlist`
- `payment_status` — `open | paid | refunded | waived | cancelled`
- `stripe_session_id` — gesetzt beim Checkout, genutzt vom Webhook
- `email_sent_at` — Idempotenz-Guard für Mailversand
- `photo_permission` — DSGVO-relevantes Einwilligungs-Feld

### Row Level Security

- **public INSERT**: Jeder darf neue Anmeldungen einreichen
- **SELECT/UPDATE**: Nur Service-Role-Key (Backend) — kein Browser-Direktzugriff auf Daten

---

## Wichtige Konventionen

### Code-Stil

- **Frontend**: TypeScript strict, Tailwind utility classes, keine externen UI-Libraries
- **Backend**: Python, snake_case für Variablen/Funktionen, Klassen PascalCase
- **Kommentare**: Englisch im Code, Deutsch in CLAUDE.md/TODO.md/Commit-Messages
- **Migrations**: Immer `IF NOT EXISTS` / `IF EXISTS` Guards — Migrations müssen idempotent sein

### Commit-Disziplin

- **Nichts committen ohne Bestätigung** des Entwicklers
- **Ein Thema, ein Commit** — keine Massen-Refactorings
- Tests schreiben für jeden neuen Code-Pfad, der DB oder externe Services anfasst

### Sicherheitspflichten (DSGVO!)

- Das System verarbeitet **Kinderdaten** (Vorname, Nachname, Geburtsdatum, Allergien)
- Allergien fallen unter Art. 9 DSGVO (besondere Kategorien) → besondere Sorgfalt
- Keine Kinderdaten in Logs ausgeben
- Keine Daten an Dritte ohne explizite Rechtsgrundlage
- Bei DB-Schema-Änderungen: Auswirkung auf Datenschutzerklärung prüfen

### API-Konventionen

- Alle Admin-Endpunkte: `Authorization: Bearer <jwt>` erforderlich
- Parameterisierte Queries überall (keine String-Interpolation in SQL)
- `registration_token` (UUID) als öffentlicher Identifier, nie `id` extern exponieren
- Stripe Webhook: immer Signatur-Verifikation, immer idempotent (AND payment_status != 'paid')

---

## Bekannte Bugs & Inkonsistenzen

> Diese Bugs existieren im aktuellen Produktionscode und müssen in Phase 1 behoben werden.
> Siehe TODO.md für die priorisierte Reihenfolge.

| ID | Schwere | Problem | Fundort |
|----|---------|---------|---------|
| B1 | Mittel | **Altersgrenze-Split-Brain**: Frontend max. 12 Jahre, DB-Schema max. 18 Jahre, Landing Page sagt "5–12 Jahre" | `RegistrationForm.tsx:107-113` vs `schema.sql:24-27` |
| B2 | Mittel | **Preis-Split-Brain**: `CAMP_PRICE = '149 €'` im Frontend (TODO-Kommentar!), Stripe nutzt `STRIPE_PRICE_CENTS` Env-Var — könnten auseinanderlaufen | `page.tsx:53` |
| B3 | Niedrig | **render.yaml veraltet**: `ADMIN_API_KEY` statt `ADMIN_PASSWORD` | `render.yaml:14` |
| B4 | Mittel | **CAMP_WEEKS dupliziert**: Identische 3 Daten in Backend + Frontend — Änderung muss an 2 Stellen erfolgen | `main.py:70-74`, `RegistrationForm.tsx:25-29` |
| B5 | Niedrig | **JERSEY_SIZES dupliziert**: Identisch in Backend + Frontend | `main.py:69`, `RegistrationForm.tsx:31` |

---

## Aktuelle Limitationen (Single-Tenant Hardcoding)

Das System enthält viele KSV-Baunatal-spezifische Strings. Für Multi-Tenant SaaS müssen
diese in Datenbank-Konfigurationen oder Env-Vars extrahiert werden.

### Hardcoded: E-Mail-Templates (backend/main.py)

- Vereinsname im E-Mail-Header: `"KSV Baunatal"` / `"Fußballschule"` (L335–336)
- Betreffzeile: `"Anmeldebestätigung Fußballschule KSV Baunatal"` (L518)
- Jahreszahl `"2026"` im Mailtext und Stripe-Produktname (L346, L949)
- Footer: `"© 2026 KSV Baunatal e.V."` (L440)
- Kontakt-E-Mail Default: `"info@ksv-baunatal.de"` (L45, L48)
- Absendername Default: `"Fußballschule KSV Baunatal"` (L44)

### Hardcoded: Backend-Konfiguration (backend/main.py)

- FastAPI app title: `"KSV Baunatal Sommercamp API"` (L192)
- Camp-Wochen: `ALLOWED_CAMP_WEEKS` Set mit 3 fixen Daten (L70–74)
- `bank_purpose()` Prefix: `"Sommercamp"` (L165)

### Hardcoded: Frontend Marketing (frontend/app/page.tsx)

- SEO-Metadata, Hero, Highlights, Ablauf-Texte — alle KSV-spezifisch
- Kontaktdaten (Ergün Ünal, E-Mail, Telefon) an 3 Stellen (L311–315, L387–389)
- Preis `CAMP_PRICE = '149 €'` mit TODO-Kommentar (L53)
- Camp-Daten Array `CAMPS` (L55–59)
- Veranstaltungsort: Parkstadion Baunatal (L206–208)

### Hardcoded: Rechtliche Seiten

- `impressum/page.tsx`: Vereinsadresse, Registernummer, Vorstandsnamen, Kontaktdaten
- `datenschutz/page.tsx`: Vereinsname, Kontakt-E-Mail, Zuständige Behörde (Hessen)

---

## Roadmap: 5 Phasen Richtung Multi-Tenant SaaS

### Phase 1 — Foundation Hardening (JETZT)
**Ziel:** Alle Bugs fix, alle Hardcodings in Config extrahiert. KSV läuft stabil.
Keine Multi-Tenant-Änderungen an DB oder Auth.

- Bugs B1–B5 beheben
- `ALLOWED_CAMP_WEEKS` und `ALLOWED_JERSEY_SIZES` als API-Endpunkt exponieren (DRY)
- `CAMP_PRICE_DISPLAY` Env-Var (aligned mit `STRIPE_PRICE_CENTS`)
- Alle E-Mail-Template-Strings in Env-Vars (`CLUB_NAME`, `CAMP_YEAR`, etc.)
- `render.yaml` korrigieren
- Minimale Test-Coverage für alle Endpunkte

### Phase 2 — Tenant Data Model
**Ziel:** DB unterstützt mehrere Vereine, KSV weiter als einziger Tenant.

- Neue Tabelle `organizations` (id, slug, name, config jsonb, ...)
- `tenant_id` FK in `camp_registrations`
- RLS-Policies per Tenant
- Per-Tenant Config: club_name, email, bank_details, camp_weeks, camp_price
- Migration: KSV als erster Tenant anlegen, alle bestehenden Registrierungen migrieren

### Phase 3 — Multi-Tenant Auth & Admin
**Ziel:** Jeder Verein hat eigene Admin-Credentials.

- `admin_users` Tabelle (oder Supabase Auth)
- Per-Tenant JWT-Ausstellung oder Supabase Auth mit Tenant-Kontext
- Tenant-Isolation in allen Admin-Endpunkten erzwingen
- Onboarding-Flow: Neuen Verein anlegen

### Phase 4 — Path-basiertes Routing
**Ziel:** `/[org-slug]/...` im Frontend, dynamische Landing Pages.

- Next.js Dynamic Routes: `app/[slug]/page.tsx`, `app/[slug]/admin/page.tsx`
- Org-Config via API laden (camp_weeks, prices, contact, logo)
- Impressum/Datenschutz per Tenant dynamisch oder Template-basiert
- Redirect: `/` → Tenant-Auswahl oder Default-Tenant

### Phase 5 — Stripe Connect
**Ziel:** Jeder Verein bekommt Zahlungen direkt auf sein Konto.

- Stripe Connect Express (Onboarding-Flow per Verein)
- `stripe_account_id` in `organizations`
- Checkout Sessions mit `stripe_account` Parameter
- Platform-Gebühr konfigurierbar
- Payout-Dashboard im Admin

---

## Lokale Entwicklung

```bash
# Backend (Voraussetzung: Python venv aktiv)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API-Docs: http://localhost:8000/docs

# Frontend (neues Terminal)
cd frontend
npm install
npm run dev
# App: http://localhost:3000
# Admin: http://localhost:3000/admin
```

Env-Vars: `backend/.env` (Vorlage: `backend/.env.example`),
`frontend/.env.local` (Vorlage: `frontend/.env.local.example`).

---

## Nicht-offensichtliche Fallstricke

1. **Stripe-Webhook muss Raw Body erhalten** — kein JSON-Parsing vor Signatur-Verifikation.
   FastAPI liest den Body via `await request.body()` — das ist korrekt und darf nicht geändert werden.

2. **Supabase Transaction Pooler (Port 6543)**: psycopg2 mit `sslmode=require`.
   Session Pooler (Port 5432) funktioniert nicht mit prepared statements.

3. **registration_token vs. id**: `id` ist intern. `registration_token` ist der öffentliche
   Identifier für Payment-Links. Nie `id` in URLs oder E-Mails exponieren.

4. **email_sent_at als Idempotenz-Guard**: Vor dem Mailversand wird geprüft, ob `email_sent_at`
   bereits gesetzt ist. Mailversand-Fehler brechen die Registrierung nicht ab (best-effort).

5. **DB-Constraint vs. Pydantic**: Validierung erfolgt doppelt (Pydantic + DB-Constraint).
   Bei CheckViolation liefert `CONSTRAINT_MESSAGES` lesbare deutsche Fehlermeldungen.

6. **CORS**: `localhost:3000` immer erlaubt. Produktions-Frontend-URL per `CORS_ORIGINS_EXTRA`.

7. **frontend/CLAUDE.md**: Enthält nur `@AGENTS.md` Redirect und eine Next.js-Version-Warnung.
   Relevante Infos stehen in diesem Root-CLAUDE.md.
