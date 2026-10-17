# CampsPilot — Plattform-Architektur

> Beschreibt die Zielarchitektur ab `feat/platform-foundation`: ein produktunabhängiger
> Plattform-Kern (Accounts/Rollen/Audit), CampsPilot als erstes Produktmodul darauf, und eine
> CEO-Konsole für den Plattform-Betreiber. Für den bisherigen SaaS-Stand (Publish-Gate,
> Vereins-Builder) siehe [`docs/saas/architecture.md`](saas/architecture.md) — dieses Dokument
> ergänzt das um die Konto-/Rollen-Schicht, ersetzt es nicht.

## 1. Drei Schichten

```
┌─────────────────────────────────────────────────────────────┐
│ 3. CEO-Konsole (/platform)                                   │
│    Betreiber-UI: Vereine, Anmeldungen global, Änderungs-      │
│    verlauf, Zugriffsverwaltung                                │
├─────────────────────────────────────────────────────────────┤
│ 2. Produktmodul: CampsPilot                                   │
│    Camps, Anmeldungen, Zahlungen, Warteliste, Export           │
│    (backend_saas/app/routers/{admin,organizations,camps,       │
│     registrations,exports}.py)                                │
├─────────────────────────────────────────────────────────────┤
│ 1. Plattform-Kern (produktunabhängig)                          │
│    Accounts (Supabase Auth), Rollen (platform_owner/           │
│    org_admin), Organisationen, Mitgliedschaften, Audit-Log     │
│    (backend_saas/app/{auth_deps,supabase_auth}.py,              │
│     app/repositories/platform_roles.py)                        │
└─────────────────────────────────────────────────────────────┘
```

Die Trennung ist im Code, nicht nur konzeptionell:

- **Schicht 1** kennt nichts von Camps/Anmeldungen. `app/auth_deps.py` und
  `app/repositories/platform_roles.py` würden unverändert funktionieren, wenn `organizations`
  morgen "Kunden eines Videoanalyse-Produkts" statt "Vereine" hießen — sie kennen nur
  `organization_id` als abstrakte Mandantengrenze.
- **Schicht 2** (bestehendes CampsPilot: `admin_schemas.py`, `repositories/{camps,
  registrations}.py`, die camp-/registration-spezifischen Router) wurde in diesem Sprint
  **nicht neu gebaut** — nur an die neue Auth-Schicht angeschlossen (`require_platform_admin`
  → `require_platform_owner`/`require_org_access`, siehe Abschnitt 3).
- **Schicht 3** (`frontend/app/platform/`) liest ausschließlich über die Admin-API von Schicht
  1+2 — keine eigene Fachlogik, keine eigene Datenbankverbindung.

## 2. Auth-Fluss

```
Browser (E-Mail + Passwort)
   │ supabase-js: signInWithPassword (Server Action, s. unten)
   ▼
Supabase Auth (auth.users, projektinternes GoTrue)
   │ liefert Access-Token (JWT)
   ▼
Next.js Server Action setzt httpOnly-Cookie (cp_admin_token, Pfad "/")
   │
   ▼
Jeder folgende Admin-Request: Authorization: Bearer <access_token>
   │
   ▼
FastAPI app/auth_deps.py::get_auth_context
   │ ruft Supabase Auth GET /auth/v1/user auf (verifiziert Signatur/Ablauf
   │ serverseitig bei Supabase, kein eigenes JWT-Secret im Backend nötig)
   ▼
app/repositories/platform_roles.py: is_platform_owner? / get_admin_organization_ids?
   │
   ▼
AuthContext { user_id, email, is_owner, admin_organization_ids }
   │
   ▼
require_platform_owner  ODER  require_org_access(organization_slug)
   │                                    │
   ▼                                    ▼
403 wenn nicht Owner          403 wenn Owner=false UND organization_id
                               nicht in admin_organization_ids
```

**Ersetzt:** das bisherige plattformweite `ADMIN_PASSWORD` + selbst signierte JWTs
(`app/admin_auth.py`, in diesem Sprint entfernt). Kein Passwort-Vergleich, kein eigenes
JWT-Secret mehr im Code von `backend_saas` — Supabase verwaltet Passwort-Hashing, Token-Ablauf
und -Widerruf.

**Wichtig — wo die Durchsetzung wirklich passiert:** ausschließlich serverseitig, in
`app/auth_deps.py`. Das Frontend blendet Links/Buttons je nach Rolle aus (z. B. zeigt
`/platform/(console)/layout.tsx` die Konsole nur für `is_platform_owner`), aber das ist reine
UX — ein manipulierter/direkter API-Aufruf ohne die passende Rolle bekommt vom Backend
denselben 401/403, unabhängig davon, was das Frontend rendert.

## 3. Rollenmodell

| Rolle | Tabelle | Bedeutung | Beispiel-Check |
|---|---|---|---|
| `platform_owner` | `platform_owners` (nur `user_id`) | Sieht/steuert **jede** Organisation. Mitgliedschaft, kein Enum-Feld — leer = niemand ist Owner (fail-closed). | `require_platform_owner` |
| `org_admin` | `organization_members` (`organization_id`, `user_id`, `role='org_admin'`) | Verwaltet **genau** die Organisationen, für die eine Mitgliedschaftszeile existiert. | `require_org_access(organization_slug)` — Owner besteht immer, org_admin nur bei passender `organization_id` |

Es gibt **keine** dritte Rolle (z. B. "read-only") — der `role`-CHECK-Constraint in
`organization_members` lässt bewusst nur `'org_admin'` zu, damit eine künftige Erweiterung ein
bewusster Migrations-Schritt ist, kein stillschweigend erlaubter Freitext.

Ein `platform_owner` braucht **keine** `organization_members`-Zeile — sein Zugriff ist global,
nicht organisationsgebunden (siehe `get_auth_context`: für einen Owner wird
`get_admin_organization_ids` gar nicht erst aufgerufen).

## 4. Wie ein neues Produktmodul angehängt wird

Beispiel: ein künftiges Videoanalyse-Produkt.

1. **Eigene Tabellen**, per eigener Migration, mit `organization_id uuid references
   organizations(id)` als Mandantengrenze — dieselbe Tabelle `organizations`, die auch
   CampsPilot nutzt (ein Verein/Kunde ist ein Verein/Kunde, unabhängig vom Produkt).
2. **Eigener Router** (`app/routers/video_analysis.py` o. Ä.), der **ausschließlich**
   `require_platform_owner`/`require_org_access` aus `app/auth_deps.py` importiert — niemals
   eine eigene Auth-Prüfung erfindet. Das ist der ganze Vertrag: jedes Produktmodul liefert nur
   seine eigenen Router/Repositories/Schemas, nie eigene Auth-Logik.
3. **Eigene Frontend-Routen** unter einem eigenen Pfad (z. B. `/pilot/[org]/video-analyse/`),
   die denselben `cp_admin_token`-Cookie und dieselbe `AuthContext` weiterverwenden — kein
   zweiter Login.
4. **CEO-Konsole optional erweitern**: `/admin/stats` um produktspezifische Kennzahlen zu
   ergänzen ist ein Repository-/Schema-Change in Schicht 3, berührt Schicht 1/2 nicht.
5. **CampsPilot bleibt unverändert.** Der Test dafür: löscht man das neue Produktmodul
   vollständig (Router, Repositories, Migration, Frontend-Routen), verhält sich CampsPilot exakt
   wie vorher — kein geteilter Zustand außer `organizations`/Rollen/Audit-Log selbst.

## 5. KSV und JK — warum sie tabu sind

`backend/` (KSV Baunatal) und der isolierte JK-Performance-Academy-Service (`sommercamps-1`)
sind **produktive Systeme mit echten Kundendaten** (Kinderdaten, DSGVO Art. 9 — Allergien,
Gesundheitsangaben), die unabhängig von diesem Plattform-Umbau weiterlaufen müssen:

- **Eigene Supabase-Projekte**, eigene Render-Services, eigene `ADMIN_PASSWORD`/`JWT_SECRET`
  (unverändert — diese Umstellung betrifft ausschließlich `backend_saas`).
- **Eigene Codebase-Teile im geteilten Frontend**: `frontend/app/lib/clubConfig*.tsx`,
  `campConfig.ts`, `frontend/app/page.tsx` (Root-Landingpage, hart auf KSV verdrahtet),
  `RegistrationForm.tsx`. Keine dieser Dateien wurde in diesem Sprint angefasst.
- **Kein Migrationsplan in diesem Sprint.** Eine spätere KSV-/JK-Migration auf die
  Shared-Multi-Tenant-Architektur ist eine eigene, bewusste Entscheidung (siehe
  [`docs/saas/migration-strategy.md`](saas/migration-strategy.md)), nicht impliziert durch
  diesen Umbau.

**Praktische Konsequenz für jede künftige Änderung:** ein Pull Request, der eine Datei unter
`backend/` oder eine der oben genannten club-spezifischen Frontend-Dateien ändert, gehört nicht
zu diesem Strang — siehe [`CLAUDE.md`](../CLAUDE.md) für die vollständige Abgrenzung.

## 6. Was dieser Sprint bewusst NICHT gebaut hat

- **Kein Videoanalyse-/Motion-Capture-Produkt** — nur die Trennung dafür vorbereitet (Abschnitt 4).
- **Kein CMS/Page-Builder** für Landingpage-Texte — es existiert keine eigenständige
  CampsPilot-SaaS-Marketing-Landingpage im Repository (nur die geteilte, KSV-verdrahtete
  Root-Seite), daher gab es nichts, das "in DB-Felder auslagern" ließe, ohne eine neue Seite zu
  erfinden — außerhalb des Auftragsrahmens ("keine neuen Großfeatures"). Siehe
  `docs/PLATFORM_FOUNDATION_HANDOFF.md` für den vollständigen Blocker.
- **Kein RLS-Policy-Set** auf den neuen Tabellen (`platform_owners`, `organization_members`,
  `audit_log`) — RLS ist aktiviert-aber-policy-los, wie bei `organizations`/`camps` (siehe
  `docs/saas/database-schema.md` §8). Durchsetzung ist Anwendungsschicht
  (`app/auth_deps.py`), da `backend_saas` per Connection-String verbindet, nicht als
  eingeloggter Supabase-Client — siehe Migration
  `20260923220000_add_platform_roles_and_audit_log.sql`'s Kommentar für die Begründung.
