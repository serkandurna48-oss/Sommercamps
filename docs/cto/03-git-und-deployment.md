# 3. Git, Staging, Production

## Ist-Zustand (geprüft 29.10.2026, Vercel-/Render-Dashboard + GitHub-Deployments-API)

| System | Deployt automatisch von | Aktuell live | Datenbank / API |
|---|---|---|---|
| Vercel `campspilot` **Production** (campspilot.vercel.app, KSV-SaaS live) | Branch `main` | `74588ce` – per **Promote** einer Preview, nicht aus `main` | Prod-API `sommercamps-0aod.onrender.com` |
| Vercel `campspilot` **Preview** | jeder andere Branch | `demo/jan` = `775345d` | Staging-API `campspilot-staging.onrender.com` (Env „Preview“ gilt für alle Branches) |
| Render `campspilot-prod` | `feat/platform-foundation`, Auto-Deploy | `4c2a61a` | Supabase SaaS Production |
| Render `campspilot-staging` | `demo/jan`, Auto-Deploy | Backend-Stand = Prod (`backend_saas/` seit `4c2a61a` unverändert) | Supabase Staging `asowsktznpiioaxerlta` |
| Vercel `jkperformance` **Production** (JK live, Legacy) | Branch `main` | `946a8b7` | Legacy-Backend JK |
| Vercel `sommercamps` **Production** (KSV-Legacy) | Branch `main` | `946a8b7` | Legacy-Backend KSV |

Git-Historie ist linear: `main (946a8b7)` ⊂ `feat/platform-foundation (4c2a61a)` ⊂
`74588ce` ⊂ `demo/jan (775345d)`.

### Die eine Falle

**Alles, was nach `main` gemergt wird, geht sofort auf drei Production-Seiten
live: SaaS, KSV-Legacy und JK.** `main` liegt 347 Commits hinter `demo/jan`.
Ein „harmloses“ Fast-Forward von `main` würde JK und die alte KSV-Seite mit
ungeprüftem Stand neu bauen. Deshalb arbeiten wir bis zur Umstellung (unten)
**nicht gegen `main`**.

Weitere Fakten:
- Repo ist **öffentlich**, `main` hat keinen Branch-Schutz, Ahmad ist noch
  kein Collaborator.
- Previews sind per Vercel-Login geschützt (Hobby-Plan). Ahmad sieht sie nur
  über einen „Shareable Link“, den Serkan erzeugt.
- Migrationen laufen **manuell** im Supabase-SQL-Editor, getrennt je Umgebung.

## Arbeitsablauf ab sofort (ohne Infrastruktur-Umbau)

```text
feature/<kurz>  ──PR──▶  demo/jan (= STAGING)  ──Release durch Serkan──▶  PRODUCTION
   ▲ von demo/jan          CI + 1 Review             1. Vercel: Staging-Preview promoten
                            Auto-Deploy Staging       2. Render: feat/platform-foundation
                                                         per Fast-Forward nachziehen
                                                         (nur wenn backend_saas/ geändert)
main = eingefroren für JK/KSV-Legacy. Nur bewusste Legacy-Releases.
```

1. **Branch:** `git switch -c feat/<thema> origin/demo/jan`. Ein Thema pro Branch,
   eigener Worktree (`git worktree add ../wt/<thema> feat/<thema>`).
2. **Lokal testen:** `scripts/dev/test-saas.ps1` (Windows) bzw. `.sh`. Grün vor PR.
3. **PR gegen `demo/jan`** (nie gegen `main`). Vorlage ausfüllen. CI-Workflow
   „SaaS checks“ (Jobs `saas-backend`, `saas-frontend`) läuft automatisch.
4. **Review:** der jeweils andere (Serkan ↔ Ahmad). Review nennt den geprüften
   SHA. Bei Agent-Arbeit zusätzlich `scripts/check-review-sha.ps1`.
5. **Merge** (Squash oder Merge-Commit, kein Force-Push auf `demo/jan`) →
   Staging deployt automatisch. Auf Staging durchklicken.
6. **Release nach Production** – nur Serkan, nach Staging-Abnahme:
   - Migration zuerst in Prod-Supabase anwenden (Backup/Restore-Plan im PR).
   - Render: `git push origin <SHA>:feat/platform-foundation` (nur Fast-Forward).
     Danach `GET /health` = 200.
   - Vercel: im Projekt `campspilot` die Preview-Deployment des SHA →
     „Promote to Production“. Danach `/pilot/ksv-baunatal` öffnen.
   - SHA + Uhrzeit in `docs/architecture/current-state-*.md` nachtragen.
7. **Rollback:** Vercel „Instant Rollback“ auf vorheriges Deployment; Render
   „Rollback“ im Deploy-Verlauf. Migrationen brauchen ein eigenes Down-Skript.

## Staging vs. Production – Trennung

| | Staging | Production |
|---|---|---|
| Frontend | Vercel Preview (`demo/jan`, Feature-Branches) | Vercel Production |
| API | `campspilot-staging` (Render) | `campspilot-prod` (Render) |
| DB/Auth | Supabase Staging | Supabase SaaS Production |
| Mails (Brevo, aus der API) | nur an `NOTIFICATION_ALLOWED_RECIPIENTS` (Code-Schutz seit 29.10.) | echt |
| Mails von Supabase Auth (z. B. Passwort-Reset) | **nicht** vom Code-Schutz erfasst – SMTP-Einstellung im Staging-Supabase prüfen | echt |
| Daten | nur synthetisch | echte Kinderdaten |
| Zugang Ahmad | ja (Staging-Konten, Shareable Link) | nein |

## Von Serkan einmalig zu erledigen (Reihenfolge)

1. **Ahmad als Collaborator** einladen (GitHub → Settings → Collaborators), Handle
   in `.github/CODEOWNERS` nachtragen.
2. **Branch-Schutz** für `demo/jan` und `main`: PR Pflicht, 1 Approval,
   Pflicht-Checks `saas-backend` und `saas-frontend` (GitHub prüft Job-Namen,
   nicht den Workflow-Namen), kein Force-Push. (Settings → Branches → Add rule.)
3. **Staging-Env** auf Render `campspilot-staging`:
   `NOTIFICATION_ALLOWED_RECIPIENTS=<eure Testadressen>` – inklusive der Adresse
   aus `PLATFORM_CONTACT_EMAIL`, sonst antwortet das Pilot-Kontaktformular auf
   Staging mit 503. `APP_ENV` auf exakt `staging` korrigieren (zeigt heute
   `staging (Text)`). Im Render-Log steht beim ersten Mailversand
   „Mail recipient guard ACTIVE“ – in Production darf diese Zeile nie erscheinen.
4. **Shareable Link** für die `demo/jan`-Preview erzeugen und Ahmad geben.
5. **Staging-Logins** für Ahmad anlegen (Supabase Staging, Plattform-Owner),
   z. B. mit `backend_saas/scripts/create_platform_user.py` gegen Staging.

## Später (Entscheidung, siehe 07)

Production-Branch der drei Vercel-Projekte trennen: `campspilot` → `release/saas`
(auch für Render prod), `jkperformance`/`sommercamps` → eingefrorene
`release/legacy`. Erst dann wird ein normales „Merge = Release“ möglich und
`main` kann zum echten Hauptzweig werden.
