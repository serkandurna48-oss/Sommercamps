# 1. Architektur

## Bild

```mermaid
flowchart LR
  subgraph Browser
    E[Eltern<br>/pilot/{org}]
    V[Vereinsadmin<br>/pilot/{org}/dashboard …]
    P[Plattform-Owner<br>/platform]
    M[Marketing + Selbststart<br>/campspilot, /campspilot/registrieren]
  end
  subgraph Vercel["Vercel-Projekt campspilot (Next.js 16)"]
    FE[frontend/app]
  end
  subgraph Render
    API[backend_saas FastAPI<br>campspilot-prod / campspilot-staging]
  end
  subgraph Supabase["Supabase (je Umgebung ein Projekt)"]
    DB[(Postgres<br>organizations / camps / camp_registrations …)]
    AUTH[Supabase Auth]
  end
  BREVO[Brevo Mail-API]
  E & V & P & M --> FE
  FE -- "öffentlich: GET/POST /api/v1/…" --> API
  FE -- "Server Actions mit Cookie-Token: /admin/…" --> API
  FE -- "Login (signInWithPassword)" --> AUTH
  API -- psycopg2 --> DB
  API -- "Token prüfen /auth/v1/user, Admin-API" --> AUTH
  API -- "Bestätigungen, Vereinsinfo" --> BREVO
```

## Komponenten

| Teil | Pfad | Hinweis |
|---|---|---|
| Elternseite + Anmeldung | `frontend/app/pilot/[org]/` (`ParentFlow`, `RegistrationFormScreen`, `DoneScreen`) | ohne Konto; Theme pro Verein; KSV-Feinschliff per `data-org='ksv-baunatal'` |
| Vereinsbereich | `frontend/app/pilot/[org]/(org-admin)/` | dashboard, aufgaben, camps, anmeldungen, warteliste, zahlungen, export, einrichtung, konfiguration, hilfe |
| Plattform-Konsole | `frontend/app/platform/` | Vereine anlegen, prüfen/freigeben, Mitglieder, Audit-Log |
| Marketing + Selbststart | `frontend/app/(marketing)/campspilot/` | `registrieren` legt Verein + Konto an |
| Admin-API-Client | `frontend/app/lib/saasAdminApi.ts`, `frontend/app/components/saas/actions/*` | Server Actions, Token im httpOnly-Cookie `cp_admin_token` |
| API | `backend_saas/app/main.py`, `routers/*` | `public`, `registrations`, `admin`, `exports`, `signup`, `pilot_request` |
| Mandantentrennung | `backend_saas/app/tenancy.py`, `auth_deps.py` | Slug → Organisation; Rollen `platform_owner`, `org_admin` |
| Mails | `backend_saas/app/notifications/` | Brevo; außerhalb Production nur an Allowlist (seit 29.10.) |
| Schema | `supabase/migrations/*.sql` | 16 Migrationen, manuell im Supabase-SQL-Editor angewendet |

## Was Legacy ist (nicht anfassen ohne Auftrag)

- `backend/` + klassische Vereinsseiten in `frontend/app/` (ohne `pilot/`, `platform/`).
  **JK Performance läuft dort produktiv** (eigener Render-Service, eigene DB).
- KSV ist im SaaS live (`/pilot/ksv-baunatal`). Die alte KSV-Legacy-Instanz existiert noch.
- Mehr Hintergrund: `docs/architecture/current-state-2026-10-28.md`.

## Auth in einem Satz

Login über Supabase Auth im Browser; die API prüft jedes Bearer-Token live bei
Supabase (`/auth/v1/user`, 60 s Cache) und liest die Rolle aus
`platform_owners` bzw. `organization_members`. Öffentliche Endpunkte brauchen
kein Token, zeigen aber nur freigegebene, veröffentlichte Vereine (sonst 404).
