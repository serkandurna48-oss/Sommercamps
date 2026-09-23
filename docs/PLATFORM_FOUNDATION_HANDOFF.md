# CampsPilot Platform Foundation — Handoff (2026-09-23)

> Branch `feat/platform-foundation`, gebaut auf `feat/saas-richtung-c-org-dashboard @ 120bf44`.
> Betrifft ausschließlich `backend_saas/` + SaaS-Routen im Frontend
> (`frontend/app/platform/`, `frontend/app/pilot/[org]/`). KSV (`backend/`) und JK
> (`sommercamps-1`) wurden nicht angefasst — siehe [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
> Abschnitt 5.

## 1. Ergebnis: teilweise testbereit — **ein Blocker verhindert jede Live-Verifikation**

Der komplette Code für Accounts/Rollen/CEO-Konsole ist geschrieben, per Unit-/Integrationstests
(mit gemockter Datenbank/Supabase, wie der Rest dieser Testsuite) verifiziert, und
typecheck/lint/build-sauber. **Aber: `backend_saas` kann in dieser Umgebung gerade nicht
gestartet werden** — die neue Pflicht-Konfiguration `SUPABASE_URL`/`SUPABASE_ANON_KEY` fehlt
hier, und ich habe keinen Zugriff auf das Supabase-Dashboard, um sie zu beschaffen. Das habe
ich live verifiziert (siehe Abschnitt 4) — es ist keine Vermutung.

**Das blockiert nicht nur die neue CEO-Konsole, sondern den gesamten `backend_saas`-Dienst**,
inklusive allem, was in den vorherigen Sprints bereits lief (Eltern-Anmeldeflow, Vereins-Admin,
Export). Ein Browser-Durchlauf war entsprechend **nicht möglich** — siehe Abschnitt 8 für den
exakten, minimalen Weg, das selbst freizuschalten (zwei Werte aus dem Supabase-Dashboard
kopieren, dann einen Owner-Account anlegen).

## 2. Was umgesetzt wurde

### Paket A — Accounts und Rollen (höchste Priorität)

- **Supabase Auth ersetzt das alte `ADMIN_PASSWORD`/JWT-Schema vollständig.**
  `backend_saas/app/admin_auth.py` (Passwort-Vergleich + selbst signierte JWTs) ist gelöscht;
  `POST /admin/login` existiert nicht mehr. Neu: `app/supabase_auth.py` (verifiziert einen
  Supabase-Access-Token per `GET /auth/v1/user` gegen Supabase selbst — kein eigenes
  JWT-Secret mehr im Backend) und `app/auth_deps.py` (die eigentliche
  Berechtigungsprüfung).
- **Rollenmodell:** `platform_owner` (Mitgliedschaftstabelle `platform_owners`, sieht/steuert
  jede Organisation) und `org_admin` (Mitgliedschaftstabelle `organization_members`, exakt die
  zugewiesenen Organisationen). Details, inkl. ASCII-Diagramm des Auth-Flusses:
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) Abschnitt 2–3.
- **Serverseitige Durchsetzung, nicht Frontend-Ausblendung:** jeder bestehende
  Admin-Endpunkt (`app/routers/admin.py`, `app/routers/exports.py`) ist jetzt entweder
  `require_platform_owner` (Vereine anlegen/auflisten, globale Anmeldungen/Änderungsverlauf,
  Zugriff zuweisen) oder `require_org_access(organization_slug)` (Owner ODER der eigene
  org_admin dieser einen Organisation — geprüft anhand der serverseitig aufgelösten
  `organization_id`, nie eines Client-Werts).
- **Migrationspfad wie gefordert:** bestehende Endpunkte (Camps/Anmeldungen/Zahlungen/Export)
  sind unverändert erreichbar — nur ihre Auth-Prüfung wurde ausgetauscht. Das alte Passwort ist
  hart deaktiviert (Code entfernt, nicht nur "still ignoriert").
- **Erster Owner:** `scripts/create_platform_user.py` — legt einen Supabase-Auth-Nutzer an
  (Passwort nie als CLI-Argument, immer interaktiv per `getpass` oder über
  `CREATE_PLATFORM_USER_PASSWORD`) und trägt ihn in `platform_owners` oder
  `organization_members` ein. Kein UI-Weg dafür — konsistent mit "nicht über die UI, keine
  Secrets im Repo".
- **Regressionstests** (siehe Abschnitt 6): org_admin A kann Org B weder lesen, ändern noch
  exportieren (403, mit echtem HTTP-Request über `TestClient`, nicht nur Logik-Unit-Test);
  nicht angemeldet = 401 auf jedem Endpunkt; platform_owner sieht/ändert alles.

### Paket B — CEO-Konsole (`/platform`)

- **Übersicht:** `GET /admin/stats` (eine Aggregat-Query, `app/repositories/platform_stats.py`)
  — veröffentlichte/Entwurfs-Vereine, Camps gesamt, Anmeldungen gesamt/letzte 30 Tage, offene
  vs. bezahlte Summen, Warteliste gesamt. Im Frontend: `StatsOverview.tsx`, oben auf `/platform`.
- **Vereine:** Liste/Detail/anlegen/veröffentlichen (alles bereits aus dem vorherigen Sprint
  vorhanden, jetzt nur mit neuer Auth) **plus neu: org_admin zuweisen/entfernen**
  (`MembersSection.tsx` auf der Vereinsdetailseite, `POST`/`GET`/`DELETE
  /admin/organizations/{slug}/members`). Bewusst kein Einladungs-Flow — kein E-Mail-Versand
  erlaubt (Auftrag Abschnitt "Grenzen"); das Konto muss vorher per
  `create_platform_user.py` existieren, sonst liefert die Zuweisung einen konkreten 404, keinen
  stillen Fehlschlag.
- **Anmeldungen global:** `/platform/registrations`, filterbar nach Verein-/Camp-Slug/Status
  (`GET /admin/registrations`, owner-only), mit Link zurück in die jeweilige
  Vereinsdetailseite.
- **Änderungsverlauf:** `/platform/audit-log`. `audit_log`-Einträge werden bei genau den
  geforderten Aktionen geschrieben: Veröffentlichen/Zurückziehen eines Vereins, Camp-Status
  geändert, Zahlungsstatus geändert, Anmeldung storniert, org_admin zugewiesen/entfernt. Ein
  fehlgeschlagener Audit-Log-Write bricht nie die eigentliche Aktion ab (siehe
  `write_audit_log`'s Docstring) — relevant, weil die Audit-Log-Tabelle in der Cloud-DB noch
  nicht existiert (siehe Blocker unten).
- **Landingpage:** **nicht umgesetzt.** Es gibt keine eigenständige CampsPilot-SaaS-
  Marketing-Landingpage im Repository — nur die geteilte, hart auf KSV verdrahtete Root-Seite
  (`frontend/app/page.tsx`), die laut CLAUDE.md/Auftrag "Grenzen" tabu ist. "Texte in DB-Felder
  auslagern" ohne eine neue Seite zu bauen war nicht sinnvoll möglich, und eine neue Seite zu
  bauen wäre ein neues Großfeature gewesen — explizit ausgeschlossen. Als offener Punkt
  benannt, nicht stillschweigend übergangen.

### Paket C — Übergabefähigkeit

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — Schichtenmodell, Auth-Fluss, Rollenmodell, wie ein
  neues Produktmodul angehängt wird, warum KSV/JK tabu sind.
- **Migrationshistorie geprüft** (read-only Query gegen die Cloud-DB, siehe Abschnitt 5) —
  Ergebnis unten, es gibt eine echte Diskrepanz, die dokumentiert werden musste.
- Neue Migration `supabase/migrations/20260923220000_add_platform_roles_and_audit_log.sql` —
  idempotent (`if not exists` überall), **nicht auf die Cloud-DB angewendet** (Auftrag: "Cloud-
  Migrationen NICHT selbst anwenden"). Exakter Anwendungsbefehl steht im Datei-Header.

## 3. Was aus dem vorherigen Stand unverändert weiterläuft

Camps/Anmeldungen/Zahlungen/Warteliste/Export (`app/repositories/{camps,registrations}.py`,
`app/xlsx_export.py`, die Fachlogik in `app/registration_lifecycle.py`) wurden **nicht neu
gebaut** — nur an die neue Auth-Schicht angeschlossen. Das bestehende Publish-Gate
(`site_published`, aus dem vorherigen Sprint) ist unverändert.

## 4. Der zentrale Blocker — live verifiziert, nicht vermutet

```
$ uvicorn app.main:app --port 8001
...
pydantic_core._pydantic_core.ValidationError: 2 validation errors for Settings
SUPABASE_URL
  Field required [type=missing, ...]
SUPABASE_ANON_KEY
  Field required [type=missing, ...]
```

Das ist **kein Bug** — `app/config.py` ist bewusst so gebaut, dass eine fehlende Pflicht-
Konfiguration beim Start klar scheitert statt später kryptisch (siehe die bestehende
`DATABASE_URL`-Validierung als Vorbild). In dieser Entwicklungsumgebung existieren
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` nirgendwo (weder in `.env` noch
sonst im Repository geprüft) — dieser Fund selbst war Teil der Bestandsaufnahme, nicht
erfunden.

**Genauer Freischalt-Weg** (durch dich, nicht durch mich — Supabase-Dashboard-Zugriff war nicht
verfügbar):

1. Supabase Dashboard → Projekt **„CampsPilot SaaS"** (Ref `wkmckfbzhmihyfwiekct`) → Settings →
   API.
2. `Project URL` → `backend_saas/.env`: `SUPABASE_URL=...` und
   `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL=...` (identischer Wert).
3. `anon` `public` Key → `backend_saas/.env`: `SUPABASE_ANON_KEY=...` und
   `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_ANON_KEY=...` (identischer Wert).
4. `service_role` Key (⚠️ niemals ins Frontend, niemals committen) →
   `backend_saas/.env`: `SUPABASE_SERVICE_ROLE_KEY=...`.
5. Migration anwenden (siehe Abschnitt 5 — noch nicht geschehen).
6. `scripts/create_platform_user.py --email dich@example.com --role owner` ausführen.
7. Backend neu starten — ab hier sollte alles unten im Klicktest funktionieren.

Erst nach diesen Schritten ist ein echter Browser-Durchlauf möglich.

## 5. Migrationshistorie — geprüft, Diskrepanz gefunden

Read-only-Abfrage gegen `supabase_migrations.schema_migrations` in der Cloud-DB (keine
Schreiboperation): **nur die allererste Migration ist dort eingetragen** (`20260917151048`).
Die drei danach (Theme-/Parent-Flow-Felder, Camp-Beschreibungsfelder, Publish-Gate — alle drei
inhaltlich bereits in der DB vorhanden, siehe vorherige Sprints) fehlen in der Tracking-Tabelle,
weil sie per direktem `psycopg2`-Skript statt `supabase db push` angewendet wurden.

**Konsequenz:** `supabase db push` könnte künftig versuchen, diese drei bereits angewendeten
Migrationen erneut auszuführen. Ihre `if not exists`/`if not exists`-Guards machen das
technisch unschädlich, aber die Tracking-Tabelle selbst bleibt bis zu einer bewussten
Reparatur (`supabase migration repair`) inkonsistent. Nicht in diesem Sprint behoben —
außerhalb des Auftragsrahmens ("keine Cloud-Migrationen selbst anwenden"), hier nur
dokumentiert.

Die neue Migration `20260923220000_add_platform_roles_and_audit_log.sql` liegt bewusst nur
lokal vor — Anwendungsbefehl im Datei-Header, siehe auch Abschnitt 4 Schritt 5:

```bash
supabase link --project-ref wkmckfbzhmihyfwiekct
supabase db push
```

## 6. Tests und Prüfergebnisse

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Backend-Testsuite | `cd backend_saas && venv\Scripts\python -m pytest -q` | **254 bestanden** (war 206 vor diesem Sprint; +48 neu, davon 10 direkt zum Rollenmodell — `test_auth_deps.py`, 18 zu den neuen CEO-Endpunkten — `test_admin_platform_console_api.py`, 10 Repository-SQL-Form — `test_platform_roles_repository.py`, 7 Supabase-Auth-Verifikation gemockt — `test_supabase_auth.py`, plus 6 direkte Cross-Org-Isolationstests in `test_admin_organizations_api.py`) |
| Cross-Org-Isolation (Paket A explizit gefordert) | `test_org_admin_cannot_read_a_different_organization`, `..._update_...`, `..._export_...`, `..._list_all_organizations`, `..._create_organizations` | **403 in jedem Fall** — echter HTTP-Request über `TestClient`, Auth per `app.dependency_overrides` gefälscht (kein echter Supabase-Call nötig), aber die komplette FastAPI-Dependency-Kette (inkl. `require_org_access`'s serverseitiger `organization_id`-Vergleich) läuft echt mit |
| Kein Zugriff ohne Login | `test_stats_without_auth_returns_401`, `test_me_without_auth_returns_401`, u. a. | **401** überall |
| platform_owner sieht alles | `test_platform_owner_can_read_any_organization` u. a. | bestanden |
| TypeScript | `cd frontend && npx tsc --noEmit` | fehlerfrei |
| Lint | `npm run lint` | 0 Fehler, 5 vorbestehende Warnungen (ungenutzte `_prev`-Parameter, bestehende Konvention) |
| Frontend-Unit-Tests | `npx vitest run` | 35 bestanden (unverändert — kein neuer Frontend-Unit-Test in diesem Sprint, da die neue Login-/Konsolen-Logik serverseitige Netzwerkaufrufe macht, die dieses Projekts Vitest-Setup bisher nicht mockt, siehe Abschnitt 9) |
| Production-Build | `npm run build` | erfolgreich, alle neuen Routen (`/platform/registrations`, `/platform/audit-log`) gelistet |
| Backend-Boot | `uvicorn app.main:app --port 8001` | **scheitert wie erwartet** ohne `SUPABASE_URL`/`SUPABASE_ANON_KEY` (Abschnitt 4) — live verifiziert, nicht vermutet |
| Browser-Durchlauf (Login → Konsole → Verein anlegen → org_admin zuweisen → org_admin-Sicht) | — | **nicht durchführbar** — Backend startet nicht (Abschnitt 4) |
| Mobiler Viewport | — | nicht anwendbar, da kein Browser-Durchlauf möglich war |

**Nichts in dieser Tabelle wurde als "getestet" behauptet, ohne dass ein Befehl tatsächlich
ausgeführt wurde.** Wo ein Test nicht möglich war (Browser-Durchlauf, Mobile), steht das
explizit, nicht stillschweigend als "erledigt" markiert.

## 7. Sicherheit — was konkret geprüft wurde

- **org_admin A → Org B:** lesen (`GET /admin/organizations/{slug}`), ändern
  (`PATCH .../organizations/{slug}`), exportieren (`GET .../export.xlsx`), Vereinsliste
  (`GET /admin/organizations`), Verein anlegen (`POST /admin/organizations`) — alle 403,
  Backend-seitig, nicht nur Frontend-Verhalten.
- **Kein Auth-Bypass:** jeder neue Endpunkt hängt an `require_platform_owner` oder
  `require_org_access`, beide über `Depends(get_auth_context)` — es gibt keinen Code-Pfad, der
  diese Prüfung umgeht.
- **Keine Secrets in Commits/Logs/dieser Datei:** `.env`/`.env.local` bleiben gitignored und
  unverändert von mir; `git diff` wurde vor dem Commit auf Secret-Muster durchsucht (siehe
  Commit-Beschreibung).

## 8. Klicktest (sobald Abschnitt 4 erledigt ist — kann ich selbst nicht ausführen)

1. `backend_saas`: `uvicorn app.main:app --port 8001` → `curl localhost:8001/health` →
   `{"status":"ok",...}`.
2. `frontend`: `npm run dev` → `http://localhost:3000/platform/login` → mit dem per
   `create_platform_user.py --role owner` angelegten Konto einloggen. **Erwartet:**
   Weiterleitung zu `/platform`, Kennzahlen-Kacheln oben (zunächst alle 0, außer ggf.
   bestehende Vereine wie `ksv-baunatal`/`jk-performance-academy`).
3. „+ Neuen Verein anlegen" → Testverein ausfüllen, absenden. **Erwartet:** Weiterleitung zur
   Vereinsdetailseite, Einrichtungs-Checkliste sichtbar.
4. Auf derselben Seite, Abschnitt „Vereinsadmins": E-Mail eines **noch nicht existierenden**
   Kontos eintragen. **Erwartet:** Fehlermeldung „Für diese E-Mail existiert noch kein Konto".
   Dann `create_platform_user.py --role org_admin --org <dein-slug> --email zweite@example.com`
   ausführen, danach dieselbe E-Mail erneut zuweisen. **Erwartet:** erscheint in der Liste.
5. Ausloggen, mit dem zweiten Konto (`org_admin`) einloggen. **Erwartet:** direkte
   Weiterleitung zu `/pilot/<dein-slug>/dashboard` (nicht `/platform` — siehe
   `(console)/layout.tsx`), da dieses Konto kein `platform_owner` ist.
6. Als org_admin versuchen, `/platform` direkt aufzurufen. **Erwartet:** Weiterleitung zurück
   in die eigene Vereinsverwaltung, kein Zugriff auf die Konsole.
7. Elternanmeldung über die öffentliche Vereinsseite abschicken (unverändertes Verhalten aus
   dem vorherigen Sprint).
8. Als Owner: `/platform/registrations` → Filter nach dem Testverein-Slug. **Erwartet:** die
   gerade abgeschickte Anmeldung erscheint.
9. `/platform/audit-log`. **Erwartet:** mindestens ein Eintrag „Verein veröffentlicht/
   zurückgezogen" vom Anlegen in Schritt 3 (falls direkt veröffentlicht) oder „Vereinsadmin
   zugewiesen" aus Schritt 4.

## 9. Offene Blocker (getrennt von späteren Verbesserungen)

**Blocker — verhindern echten Betrieb:**

- **`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` fehlen** (Abschnitt 4) —
  der zentrale Blocker, verhindert jeden Start von `backend_saas`.
- **Migration nicht angewendet** (Abschnitt 5) — selbst mit den Supabase-Keys würde jede
  Rollenprüfung mangels Tabellen fehlschlagen (`relation "platform_owners" does not exist"`),
  bis `supabase db push` (oder das manuelle SQL) gegen die Cloud-DB gelaufen ist.
- **`backend_saas/scripts/seed_demo.py` ist gebrochen** — ruft noch das entfernte
  `POST /admin/login` auf. `scripts/onboard_tenant.py` wurde in diesem Sprint auf die neue
  Supabase-Anmeldung umgestellt (gleiches Muster); `seed_demo.py` bräuchte denselben Fix,
  wurde aus Zeitgründen nicht mehr gemacht — konkret benannt, nicht stillschweigend
  übergangen.

**Spätere Verbesserungen (kein Blocker):**

- Keine Landingpage-Textverwaltung (Abschnitt 2, Paket B) — es gibt noch keine eigenständige
  SaaS-Landingpage, an der das andocken könnte.
- Kein RLS-Policy-Set auf den drei neuen Tabellen (siehe `docs/ARCHITECTURE.md` Abschnitt 6) —
  konsistent mit dem bestehenden Muster bei `organizations`/`camps`.
- Kein Frontend-Unit-Test für die neue Login-Logik (Abschnitt 6) — würde neue
  Mocking-Infrastruktur für Server Actions mit externen Netzwerkaufrufen brauchen, die dieses
  Projekt noch nicht hat.
- `organization_members`-Liste zeigt aktuell keine E-Mail-Adresse für bereits zugewiesene
  Mitglieder (nur beim gerade erfolgten Zuweisen) — bräuchte einen zusätzlichen Supabase-
  Admin-API-Aufruf pro Mitglied, bewusst für v1 ausgelassen (Performance/Komplexität).

## Branch, Commits, Pfad

- Branch: `feat/platform-foundation` (Basis: `feat/saas-richtung-c-org-dashboard @ 120bf44`)
- Commits: siehe `git log feat/platform-foundation` — Commit-Hashes werden nach dem finalen
  Review/Commit unten ergänzt.
- Dieses Dokument: `docs/PLATFORM_FOUNDATION_HANDOFF.md`
- Architektur-Referenz: `docs/ARCHITECTURE.md`
