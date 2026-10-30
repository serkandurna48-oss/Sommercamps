# CampsPilot – technischer Betriebsstand (28.10.2026)

**Zielgruppe:** Gründer, CTO, neue Entwickler. **Stand:** manuell gegen Git-Refs,
Vercel, Render und Supabase geprüft. Diese Seite hat Vorrang vor älteren
Legacy-Roadmaps und README-Abschnitten, die den SaaS-Ausbau noch als Zukunft
beschreiben. Neue Releases müssen die SHA-Angaben aktualisieren.

## 1. Es existieren zwei Architekturen parallel

| | Legacy je Verein | Geteiltes SaaS |
|---|---|---|
| Frontend | `frontend/app/` (konfigurierter Club) | `frontend/app/pilot/[org]/`, `/platform` |
| API | `backend/main.py` | `backend_saas/app/main.py` |
| Daten | getrennte Supabase-Projekte je Club | EIN Supabase-Projekt mit `organization_id` |
| Betrieb | ältere Render-/Vercel-Projekte | Render `campspilot-prod`, Vercel `campspilot` |
| Status | Altbetrieb separat vorhanden | KSV live, JK-SaaS-Mandant noch nicht veröffentlicht |

**Keines der alten Deployments löschen oder auf die neue Datenbank umbiegen.**
Die SaaS-Produktions-URL ist https://campspilot.vercel.app/pilot/ksv-baunatal .
Öffentlicher API-Root: https://sommercamps-0aod.onrender.com .

## 2. Datenfluss / Mandantenmodell

```text
Eltern  ──> Next.js /pilot/{org} ──> FastAPI /api/v1/organizations/{org}
                                                    |
                                                  PostgreSQL
Organizations (1) ──< Camps (N) ──< CampRegistrations (N)
  |                     |
  +── OrganizationMembers + PlatformOwners, AuditLog
```

- `organizations`: Vereinsstamm, Veröffentlichung, Branding, Zusatzfragen.
- `camps`: Zeitraum, Kapazität, Preis in Cent, Veröffentlichungsstatus.
- `camp_registrations`: Status, Zahlung, Warteliste, Eltern-/Kinddaten und
  Einwilligungen. **Keine Echtdaten in GitHub, Logs oder Test-Fixtures.**
- `organization_id` ist der Tenant-Schlüssel. Backend-Abfragen filtern ihn;
  zusammengesetzter FK hält Camp und Anmeldung im selben Verein.
- RLS ist aktiviert. Konkrete Policies und Zugriffsgrenzen müssen vor
  Migration/Skalierung nochmals gegen den Cloudzustand geprüft werden.
- Produktive Zahlen sind Momentaufnahmen, keine Architektur-Verträge.

## 3. Was läuft im SaaS?

**Verifiziert implementiert:** Vereins-/Camp-CRUD, öffentlicher Elternflow ohne
Konto, serverseitige Kapazitäts-/Altersprüfung, Warteliste, Teilnahme-/
Zahlungsstatus-Verwaltung, Betreiber-/Vereinsrollen, CSV/XLSX-Export,
Bestätigungs-Mail-Anbindung, kundenspezifisches Branding und Zusatzfragen,
Datenschutzseiten und explizite Einwilligung für freiwillige Gesundheitsdaten.

**Nicht als abgeschlossen behaupten:** vollständiger Stripe-End-to-End-
Zahlungsprozess, automatisierte Löschung nach 30 Tagen (Gesundheit) bzw.
12 Monaten (allgemeine Anmeldung), rechtsgeprüfter AVV-Prozess für alle
Kunden, JK-SaaS-Produktivabnahme, Migration zwischen Legacy- und SaaS-DB.
Manuelle Retention-Dry-Run-Datei: `backend_saas/scripts/retention_dry_run.py`.

## 4. Live-Code und GitHub sind NICHT dieselbe Branch-Spitze

> **Korrektur 29.10.2026 (gegen Vercel-Einstellungen geprüft):** Alle drei
> Vercel-Projekte (`campspilot`, `jkperformance`, `sommercamps`) bauen
> Production automatisch aus `main`. `campspilot` Production (`74588ce`) kam
> per „Promote“ einer Preview; JK und KSV-Legacy laufen auf `main` = `946a8b7`.
> Ein Merge nach `main` geht also sofort auf drei Live-Seiten. Gültiger
> Ablauf und aktuelle SHAs: [docs/cto/03-git-und-deployment.md](../cto/03-git-und-deployment.md).

**Zeitpunkt dieser Prüfung (28.10.2026):**

| System | Quelle | Verifizierter Code-Stand |
|---|---|---|
| Vercel `campspilot` Produktion | Promote der Preview, 30.10.2026 19:10 (Serkan) | `c840fa8` = v1-Release (vorher `daf7fef`) |
| Render `campspilot-prod` | Branch `feat/platform-foundation`, Fast-Forward 30.10.2026 nachmittags | `c840fa8` (vorher `daf7fef`) |
| GitHub `main` | Default-Branch, Production-Branch aller 3 Vercel-Projekte | `946a8b7` (JK + KSV-Legacy live) |
| GitHub `demo/jan` | Staging (Render `campspilot-staging` + Vercel-Preview) | `c840fa8` (30.10., = Production) |

v1-Release `c840fa8` enthält #51–#62: Eltern-E-Mail korrigieren, Impressum-Pflichtangaben,
Eltern-Fokus, Plattform-Kopf, einzeilige Marketing-Navigation auf dem Handy, Slug-Prüfung,
Zahlungsstatus „Kostenlos“ (z. B. Trainerkinder), KSV-Hero und Datum-Hover.
Geprüft nach dem Promote: `/campspilot`, `/preise`, `/pilot/ksv-baunatal`, `/platform/login`
antworten 200 ohne Vercel-Login, Prod-API `/health` ok.

**ACHTUNG:** Die UX-Branch-Spitze ist inzwischen weiter als das zuletzt
bestätigte Vercel-Produktionsdeployment. Keine Behauptung „auf live“, nur weil
ein Commit auf GitHub liegt. Autoritativer Nachweis: Vercel-Deployment-SHA
plus öffentlicher HTTP-/Browsercheck. Backend: Render-Deploy-SHA plus /health.

## 5. Entwicklung zu zweit – verbindlicher Ablauf (Vorschlag)

1. **Produktauftrag:** CEO beschreibt Kundennutzen und Fertig-Kriterium,
   CTO klärt Architektur, Risiken, Schätzung und Review.
2. **Branch je Änderung:** vom explizit vereinbarten Integrationsstand
   (bis zur Konsolidierung NICHT blind `main`). Keine Arbeit im
   Live-Branch oder fremden Worktree.
3. **PR statt Direkt-Push:** kleines Review, gemeinsame Definition of Done,
   Codeowner und mindestens eine unabhängige Freigabe; überprüfte SHA im Review.
4. **Automatische CI:** `.github/workflows/ci-saas.yml` prüft Frontend-
   Vitest/Lint/TypeScript/Build und SaaS-Backend-Pytest mit einer isolierten, kurzlebigen CI-Postgres-Datenbank, ohne Produktionsdaten.
   Die alte `ci.yml` prüft primär das Legacy-System und ist nicht ausreichend.
5. **Staging:** eigener Deploy und isolierte Testdaten, durchgespielter
   Eltern- und Admin-Flow, Berechtigungen, Mails, Warteliste, Rollback.
6. **Production:** nur nach expliziter Freigabe, dokumentierter Revision und
   Restore-Plan. Danach genau die veröffentlichte SHA sowie echte GET-Smokes
   prüfen. Keine fingierten Kinderanmeldungen in Prod.
7. **Release-Steuerung:** Branch-/Projekt-Zuordnungen in Vercel/Render
   vereinheitlichen; erst danach `main` als Kanon etablieren.

## 6. Was Ahmad zuerst entscheiden sollte

- **Plattformwahl:** bestehendes SaaS als produktive Ausgangsbasis
  beibehalten; Ahmads Neubau im isolierten Staging anhand gleicher
  Testfälle vergleichen. Kein Big-Bang-Datentransfer.
- **Architekturvertrag:** API/Schema, Tenant-Isolation, Idempotenz,
  PII-Felder, Migration, Backup und Rückfallplan dokumentieren.
- **Erste gemeinsame Abnahme:** echter neuer Verein durch
  Einladung/Onboarding -> Camp erstellen -> Eltern-Testanmeldung in Staging ->
  Vereinsadmin -> Zahlung/Warteliste/Export.
- **Geschäftsmaßstab:** erfolgreiche reale Anmeldungen, zahlende Vereine,
  Onboarding-Zeit, Fehlerquote/Uptime statt reine LOC oder Commitzahl.

## 7. Offene Risiken, die nicht wegdokumentiert werden dürfen

- Das Repo enthält noch ältere, teilweise objektiv überholte README-/
  Architekturabschnitte. Diese Datei ist die Korrekturreferenz, bis sie
  vollständig konsolidiert wurden.
- Das aktuelle Vercel-Frontend und Render-Backend folgen verschiedenen
  Git-Branch-Spitzen. Derzeit ein Release-Risiko, auch bei grünen Unit-Tests.
- `backend_saas/tests/test_review_postgres.py` testet DB-Isolation nur mit
  ausdrücklich gesetztem `REVIEW_POSTGRES_PORT` und einer *wegwerfbaren
  lokalen DB*. Der neue SaaS-CI-Job stellt ausdrücklich eine frische Postgres-17-Instanz auf diesem Port bereit und führt auch die Integrationstests aus. Lokal ohne Port schlagen insbesondere die Importtests absichtlich fehl; niemals auf die Produktionsdatenbank zeigen lassen.
- Echte medizinische Angaben von Kindern: zusätzliche Datenschutz-
  Sicherheitsprüfung vor Übertragung in ein anderes System erforderlich.
