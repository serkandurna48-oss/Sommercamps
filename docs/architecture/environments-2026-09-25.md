# Environments — Ist-Stand 25.09.2026

Reine Bestandsaufnahme, keine Empfehlungen. Nicht committen (Arbeitsanweisung).
Erhoben read-only über: `git`, `gh api`, Vercel Dashboard (Browser), Render Dashboard (Browser),
Supabase Dashboard (Browser), öffentliche CampsPilot-SaaS-API (`/api/v1/organizations/{slug}`).
Keine Zugangsdaten eingegeben, keine Secret-Werte in diesem Dokument (siehe "Unklar/nicht einsehbar").

## 1. Branches

Repo: `C:\Users\serka\Desktop\Projekte\Sommercamps`, Remote `github.com/serkandurna48-oss/Sommercamps`.

| Branch | Ref | Letzter Commit | Betreff | Ahead/Behind `main` | Ahead/Behind `feat/platform-foundation` | Gemergt→main | Gemergt→feat/platform-foundation | Offener/letzter PR |
|---|---|---|---|---|---|---|---|---|
| chore/ci | local | 2026-07-15 | ci: add frontend and backend quality checks | behind 41, ahead 0 | behind 71, ahead 0 | ja | ja | #2 MERGED → main |
| chore/claude-local-settings | local | 2026-09-17 | chore: keep Claude local settings untracked | behind 22, ahead 0 | behind 52, ahead 0 | ja | ja | #18 MERGED → main |
| chore/engineering-docs | local | 2026-07-15 | docs: add engineering workflow and project documentation | behind 44, ahead 0 | behind 74, ahead 0 | ja | ja | #1 MERGED → main |
| chore/phase-1-b1-completion | remote-only | 2026-05-19 | docs: update session notes with B1 completion status | behind 57, ahead 0 | behind 87, ahead 0 | ja | ja | keiner |
| chore/phase-1-bugfixes | remote-only | 2026-05-19 | fix(pricing): load camp price from backend config endpoint | behind 66, ahead 0 | behind 96, ahead 0 | ja | ja | keiner |
| cp-s203-email-polish | local | 2026-07-06 | fix(email): improve Brevo confirmation copy and bank fallbacks | behind 51, ahead 0 | behind 81, ahead 0 | ja | ja | keiner |
| cp-s204-admin-payment-qa | local | 2026-07-06 | fix(admin): harden CSV export and filtered empty state | behind 51, ahead 0 | behind 81, ahead 0 | ja | ja | keiner |
| cp-s205-mobile-polish | local | 2026-07-06 | fix(mobile): polish parent registration flow | behind 51, ahead 0 | behind 81, ahead 0 | ja | ja | keiner |
| cp-s206-prod-readiness | local | 2026-07-06 | chore(prod): document backups costs and sanitize production logs | behind 46, ahead 0 | behind 76, ahead 0 | ja | ja | keiner |
| cp-s301-light-club-config | local | 2026-07-06 | refactor(config): extract KSV club and camp configuration | behind 45, ahead 0 | behind 75, ahead 0 | ja | ja | keiner |
| cp-s308-light-jk-draft | local | 2026-07-15 | feat(jk): small changes | behind 33, ahead 0 | behind 63, ahead 0 | ja | ja | #13 MERGED → main |
| cp-s401-saas-foundation | local | 2026-09-17 | docs(saas): align project guidance with parallel SaaS architecture | behind 33, ahead 2 | behind 61, ahead 0 | nein | ja | keiner |
| cp-s402-saas-database-foundation | local | 2026-09-17 | feat(saas): add multi-tenant database foundation | behind 33, ahead 4 | behind 59, ahead 0 | nein | ja | keiner |
| cp-s403-saas-backend-foundation | local | 2026-09-17 | feat(saas): add isolated FastAPI backend foundation | behind 33, ahead 5 | behind 58, ahead 0 | nein | ja | keiner |
| cp-s404-organizations-camps-api | local | 2026-09-17 | feat(saas): add tenant-scoped organization and camp APIs | behind 33, ahead 6 | behind 57, ahead 0 | nein | ja | keiner |
| cp-s405-public-registration-api | local | 2026-09-17 | feat(saas): add tenant-safe public camp registration | behind 33, ahead 7 | behind 56, ahead 0 | nein | ja | keiner |
| cp-s406-registration-lifecycle | local | 2026-09-17 | feat(saas): add waitlist and registration lifecycle | behind 33, ahead 8 | behind 55, ahead 0 | nein | ja | keiner |
| cp-s407-saas-staging-deployment | local | 2026-09-22 | chore: add local dev quickstart, -Saas launch mode, and repo hygiene | behind 15, ahead 17 | behind 28, ahead 0 | nein | ja | keiner |
| feat/campspilot-marketing-site | local | 2026-09-22 | feat(marketing): redirect campspilot.vercel.app root to /campspilot | behind 1, ahead 0 | behind 45, ahead 14 | ja | nein | #20 MERGED → main |
| feat/jk-101-requirements | local | 2026-07-15 | Merge pull request #2 from chore/ci | behind 40, ahead 0 | behind 70, ahead 0 | ja | ja | keiner |
| feat/jk-102-isolated-infra-v2 | local | 2026-09-17 | docs: professionalize CLAUDE.md into a compact steering file | behind 21, ahead 0 | behind 51, ahead 0 | ja | ja | #17 MERGED → main |
| feat/jk-103-section-components | local (Worktree) | 2026-09-21 | fix(jk): Kopfzeile auf Handys und Trefferflaeche der Nebenangebote | behind 18, ahead 6 | behind 48, ahead 6 | nein* | nein* | #19 MERGED → main |
| feat/platform-foundation | local (Hauptordner) | 2026-09-24 | fix(frontend): bump @types/node to ^24 to fix Vercel build failure | behind 15, ahead 45 | — | nein | ja | keiner |
| feat/saas-richtung-c-org-dashboard | local | 2026-09-23 | feat(saas): platform console org detail, preview, publish toggle, camp creation | behind 15, ahead 33 | behind 12, ahead 0 | nein | ja | keiner |
| fix/c17ac56-review | local (Worktree) | 2026-09-25 | fix(saas): apply reviewed c17ac56 fixes (registration race, participant edit, deadlines, form reset) | behind 15, ahead 46 | behind 0, ahead 1 | nein | nein | #21 OPEN → feat/platform-foundation |
| fix/db-connection-pool | local | 2026-07-21 | fix(backend): discard stale database connections safely | behind 39, ahead 0 | behind 69, ahead 0 | ja | ja | #15 MERGED → main |
| fix/jk101-inquiries-html-escaping | local | 2026-09-21 | fix(backend): escape user input in training inquiry notification email | behind 15, ahead 1 | behind 45, ahead 1 | nein | nein | keiner |
| fix/render-yaml-plan-drift | local | 2026-07-21 | Merge pull request #13 from cp-s308-light-jk-draft | behind 25, ahead 0 | behind 55, ahead 0 | ja | ja | keiner |
| main | local | 2026-09-21 | Merge pull request #19 from feat/jk-103-section-components | — | behind 45, ahead 0 | ja | ja | — |
| worktree-fix-render-yaml-plan | local (Worktree) | 2026-07-21 | fix(render): correct plan drift in render.yaml | behind 24, ahead 0 | behind 54, ahead 0 | ja | ja | #16 MERGED → main |

`*` `feat/jk-103-section-components`: PR #19 ist als MERGED markiert, der `git merge-base --is-ancestor`-Check zeigt trotzdem "nein" — vermutlich Squash-Merge (der Ziel-Commit in `main` ist nicht identisch mit der Branch-Spitze). Bei Squash-Merges ist die PR-Spalte maßgeblich, nicht die Ancestor-Prüfung.

Alle 21 offenen Remote-Branches wurden erfasst (`git branch -r`); 2 davon (`chore/phase-1-b1-completion`, `chore/phase-1-bugfixes`) existieren nur remote, kein lokaler Branch.

## 2. Git-Worktrees

| Pfad | Branch/HEAD | Status |
|---|---|---|
| `C:\Users\serka\Desktop\Projekte\Sommercamps` (Hauptordner) | `feat/platform-foundation` @ `c17ac56` | 3 untracked Dateien: `CODEX-UEBERGABE-c17ac56.md`, `docs/design/audit-2026-09-25-legacy.md`, `docs/reviews/` |
| `C:\Users\serka\AppData\Local\Temp\claude\...\scratchpad\frontend-jk` | detached @ `ba1585d` | clean |
| `C:\Users\serka\AppData\Local\Temp\sommercamps-review-656ae1c` | detached @ `656ae1c` | clean |
| `C:\Users\serka\AppData\Local\Temp\sommercamps-review-c17ac56` | `fix/c17ac56-review` @ `8516ee7` | clean |
| `C:\Users\serka\Desktop\Projekte\jk-103` | `feat/jk-103-section-components` @ `87324a1` | clean |
| `C:\Users\serka\Desktop\Projekte\Sommercamps\.claude\worktrees\fix-render-yaml-plan` | `worktree-fix-render-yaml-plan` @ `7db0c3c` | clean |

## 3. Deployments: Umgebung → Frontend → Backend → DB

### Vercel-Projekte (Account `serkans-projects-a49183cd`, Repo `serkandurna48-oss/Sommercamps`)

| Projekt | Production Branch | Root Directory | Domains | Env-Vars (Scope) |
|---|---|---|---|---|
| **sommercamps** | `main` | `frontend` | `ksv-sommercamps.vercel.app` (Production) | `NEXT_PUBLIC_API_URL` (Production+Preview, Typ Secret, Wert nicht einsehbar) |
| **jkperformance** | `main` (aber **kein** Production-Deployment aktuell live laut Vercel-Übersicht) | `frontend` | `jkperformance-serkans-projects-a49183cd.vercel.app` (Production, default); `jkperformance.vercel.app` (fest auf Branch `cp-s308-light-jk-draft` gepinnt, unabhängig von Production-Branch-Setting) | `NEXT_PUBLIC_ACTIVE_CLUB=jk` (All Environments, Wert sichtbar); `NEXT_PUBLIC_API_URL` (Production+Preview, Typ Secret, Wert nicht einsehbar) |
| **campspilot** | `main` | `frontend` | `campspilot.vercel.app` (Production) | `NEXT_PUBLIC_SITE_MODE` (Production, Wert nicht eingesehen); `NEXT_PUBLIC_SAAS_API_URL` = `https://sommercamps-0aod.onrender.com` (**nur Preview**); `NEXT_PUBLIC_SUPABASE_URL` = `https://wkmckfbzhmihyfwiekct.supabase.co` (**nur Preview**); `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nur Preview, Wert nicht eingesehen) |

Weitere Vercel-Projekte im selben Account, aber **anderes Repo** (nicht Teil von Sommercamps): `command-pilot`, `handwerker-tool`, `jack-portfolio`, `digital-business`, `resell-os` — nicht weiter erfasst.

Aktuelle Preview-Deployments für `fix/c17ac56-review` (Commit `8516ee7`, alle Status "Ready"):
- sommercamps: `sommercamps-git-fix-c17ac56-review-serkans-projects-a49183cd.vercel.app`
- campspilot: `campspilot-git-fix-c17ac56-review-serkans-projects-a49183cd.vercel.app`
- jkperformance: `jkperformance-git-fix-c17ac56-review-serkans-projects-a49183cd.vercel.app` (URL-Muster analog, nicht einzeln geöffnet)

**Wichtig:** `campspilot` (Preview) und `sommercamps` (Vercel-Projekt, Legacy-KSV) sind zwei unterschiedliche Dinge. Die SaaS-Fixes (`backend_saas` + `/pilot/[org]/`) laufen ausschließlich über das Vercel-Projekt **campspilot**, nicht über `sommercamps`.

### Render-Services (Workspace "My Workspace", Projekt "Production", Region jeweils Frankfurt/EU Central)

| Service | Repo/Branch | Aktueller Commit | Root Directory | Auto-Deploy | URL |
|---|---|---|---|---|---|
| **Sommercamps** (= `backend_saas`) | `serkandurna48-oss/Sommercamps` @ `feat/platform-foundation` | `c17ac56` (Live) | `backend_saas` | On Commit | `https://sommercamps-0aod.onrender.com` |
| **KSV Baunatal** (= Legacy-Backend KSV) | `serkandurna48-oss/Sommercamps` @ `main` | `1eff8db` (Live) | `backend` | On Commit | `https://sommercamps.onrender.com` |
| **JK Performance** (= Legacy-Backend JK) | `serkandurna48-oss/Sommercamps` @ `main` | `1eff8db` (Live) | `backend` | On Commit | `https://sommercamps-1.onrender.com` |

Weitere Render-Services im selben Workspace, aber anderes Produkt: `CommandPilot` (Deployed), `HandwerkerTool` (suspendiert), `enis-gartenservice` (suspendiert) — nicht weiter erfasst.

Der Fix-Branch `fix/c17ac56-review` (PR #21, offen) ist **nicht** auf Render deployed — nur der Basiscommit `c17ac56` von `feat/platform-foundation` läuft aktuell live.

### Supabase-Projekte (Org "serkandurna48-oss's Org", Pro Plan, 4 Projekte total)

| Projekt-Name | Ref | Region |
|---|---|---|
| CampsPilot SaaS | `wkmckfbzhmihyfwiekct` | eu-central-1 |
| Sommercamps | `oeemiqykowbeftdnjtrt` | eu-west-2 |
| JK Performance | `yuapavqkmcuktendprik` | eu-west-1 |
| Command-Pilot | (nicht erfasst, anderes Produkt) | eu-central-1 |

### Zuordnung Umgebung → Frontend → Backend → DB

| Umgebung | Frontend (Vercel) | Backend | Supabase/DB |
|---|---|---|---|
| SaaS, Preview (alle Feature-Branches inkl. `fix/c17ac56-review`) | Projekt `campspilot`, Preview-Domain je Branch | Render-Service **Sommercamps** (`sommercamps-0aod.onrender.com`) | **CampsPilot SaaS** (`wkmckfbzhmihyfwiekct`) — direkt aus `DATABASE_URL` des Render-Service verifiziert, identisch mit dem in Vercel `campspilot` (Preview-Scope) hinterlegten `NEXT_PUBLIC_SUPABASE_URL` |
| SaaS, Production | Projekt `campspilot`, `campspilot.vercel.app` | kein `NEXT_PUBLIC_SAAS_API_URL` in Vercel Production-Scope hinterlegt → Produktionsdomain zeigt nur die Marketing-Seite (`NEXT_PUBLIC_SITE_MODE`-Redirect), keine aktive Anbindung an `/pilot/[org]` erkennbar | — (keine Anbindung in Production-Scope gefunden) |
| KSV Legacy | Projekt `sommercamps`, `ksv-sommercamps.vercel.app` | Render-Service **KSV Baunatal** (`sommercamps.onrender.com`), Root `backend`, Branch `main` | Vermutlich Supabase-Projekt **Sommercamps** (`oeemiqykowbeftdnjtrt`) — Namensgleichheit, **nicht direkt verifiziert** (siehe Abschnitt 4) |
| JK Legacy | Projekt `jkperformance` | Render-Service **JK Performance** (`sommercamps-1.onrender.com`), Root `backend`, Branch `main` | Vermutlich Supabase-Projekt **JK Performance** (`yuapavqkmcuktendprik`) — Namensgleichheit, **nicht direkt verifiziert** (siehe Abschnitt 4) |

## 4. Vereine im produktiven CampsPilot-SaaS-Projekt

Geprüft über die öffentliche, unauthentifizierte API `GET /api/v1/organizations/{slug}` auf `https://sommercamps-0aod.onrender.com` (zeigt auf Supabase-Projekt `wkmckfbzhmihyfwiekct`). Diese API erlaubt **kein Auflisten** aller Vereine — nur Abfrage bei bekanntem Slug. `plan_status` und `site_published` sind keine Felder der öffentlichen Antwort (nur Admin-Schema, login-pflichtig).

| Slug (getestet) | Ergebnis | Name |
|---|---|---|
| `ksv-baunatal` | 200 | KSV Baunatal (kontakt: info@ksv-baunatal.de) |
| `jk-performance-academy` | 200 | JK Performance Academy (Platzhalter-Kontakt) |
| `campspilot-pilot` | 200 | CampsPilot Staging Pilot (Kontakt: staging-pilot@campspilot.example — wirkt synthetisch/Test) |
| `ksv`, `jk`, `ksvbaunatal`, `test`, `demo`, `cptest` | 404 | — |

`plan_status`/`site_published` für keinen der drei gefundenen Slugs einsehbar ohne Admin-Login.

## 5. Unklar / nicht einsehbar

- **`NEXT_PUBLIC_API_URL`** (Vercel-Projekte `sommercamps` und `jkperformance`): Typ "Secret", in der Vercel-UI grundsätzlich nicht wieder anzeigbar — Wert unbekannt.
- **Supabase-Ref für KSV-/JK-Legacy-Backends**: Die Zuordnung Render-Service → Supabase-Projekt wäre nur über `DATABASE_URL` in den Render-Env-Vars der Services **KSV Baunatal** und **JK Performance** zu verifizieren gewesen. Das Aufdecken dieser Werte wurde als außerhalb des angefragten Render-Scopes (Name/Branch/Commit/Auto-Deploy/URL) eingestuft und nicht durchgeführt. Zuordnung in Abschnitt 3 ist daher nur eine Namens-Vermutung.
- **`NEXT_PUBLIC_SITE_MODE`-Wert** (Vercel `campspilot`, Production-Scope): nicht ausgelesen (nicht URL, daher gemäß Auftrag nicht zwingend nötig; grep im Code zeigt keine Verwendung im `frontend/`-Quellcode selbst — nur in `docs/reviews/c17ac56-handoff.md` erwähnt).
- **Vollständige Vereinsliste im SaaS-Projekt**: nicht einsehbar ohne Admin-Login (`/platform/login`); die öffentliche API listet nicht, sondern beantwortet nur Einzelabfragen nach bekanntem Slug. Es könnten weitere Vereine existieren, die nicht erraten wurden.
- **`plan_status` / `site_published`** je Verein: nur über Admin-API (`/admin/organizations`) einsehbar, login-pflichtig — nicht geprüft (keine Zugangsdaten eingegeben, wie angewiesen).
- **Warum `feat/jk-103-section-components` per Ancestor-Check "nein" zu main zeigt, obwohl PR #19 MERGED ist**: vermutlich Squash-Merge: nicht abschließend verifiziert (keine weitere Git-History-Analyse durchgeführt, da außerhalb des reinen Bestandsaufnahme-Auftrags).
- **jkperformance Vercel-Projekt**: Laut Projekt-Übersicht "No Production Deployment", obwohl Production Branch auf `main` gesetzt ist — nicht geklärt, ob das an einem fehlgeschlagenen Build, einem pausierten Projekt oder einer bewussten Konfiguration liegt.
