ux/u0g-admin-vorschau
STATUS: fertig zur Prüfung
COMMIT: ux: U0g Dev-Vorschau Admin-Oberfläche

## Umsetzung

- Neue Server-Route `/dev/admin-vorschau/[screen]` und Index `/dev/admin-vorschau`; beide liefern außerhalb von `NODE_ENV=development` sofort `notFound()`.
- Acht Screens verwenden die gemeinsame AdminShell, MatchdayBand, Navigation, OrgSwitcher und dieselben Inhaltskomponenten wie die echten Seiten. Deren Lade- und Auth-Sequenzen bleiben unverändert.
- Ausschließlich lokale Fixtures: JK Performance Academy, Theme `akademie`, Farbe `#B8912B`, Logo `/jk/logo.jpg`; drei Camps, 28 Anmeldungen einschließlich vier Wartelisteneinträgen. Belegung: 16/16 und 6/12; drittes Camp als Entwurf. Alle Personen erfunden, sämtliche E-Mails unter `@campspilot.example`.
- Aufgaben entstehen aus denselben Berechnungen wie in der echten Verwaltung. `?leer=1` liefert keine Camps/Anmeldungen; Camp-Detail und Camp-Konfiguration zeigen dann eine leere Camp-Ansicht.
- Vorschau-Actions einschließlich Teilnehmerkorrektur, Zahlung, Storno, Warteliste, Veröffentlichung und Abmelden sind lokale No-ops. Links und Prefetch bleiben in der Vorschau. Serverseitiger Excel-Export ist dort deaktiviert; CSV/Filter/Teilnehmerdetails bleiben lokal bedienbar.
- Keine Backend-, Supabase- oder Auth-Aufrufe durch die Vorschau. Der globale Proxy betrifft nur `/` und greift hier nicht ein.

## TESTS

`npm.cmd run test --prefix frontend` — Exit 0, 0 failed. Ergebniszeilen wörtlich:

```text
 Test Files  27 passed (27)
      Tests  245 passed (245)
```

Abdeckung: direkte Route-/Index-Aufrufe mit gestubbtem NODE_ENV test/production, unbekannter Screen, alle acht Screens mit Fixtures und Leerzustand per renderToStaticMarkup, lokale Formularaktionen ohne Auth/Fetch, Fixture-Konsistenz sowie Rendering und Auth-Verhalten der acht echten Seiten. Die bisherigen Tests bestehen ebenfalls.

`frontend/vitest.config.mjs` begrenzt ausschließlich unter Windows auf einen Worker und setzt das Testzeitlimit auf 30 Sekunden. Vorher scheiterten fünf Workerstarts; im seriellen Diagnoselauf überschritt ein bestehender Teilnehmer-Test das bisherige Fünf-Sekunden-Limit. Testauswahl und Assertions bleiben unverändert, Linux verwendet die bisherigen Defaults. Der oben dokumentierte erfolgreiche Abschluss verwendet den Standardbefehl ohne zusätzliche CLI-Flags.

TypeScript: Exit 0, keine Fehler. Ausgeführt mit dem bereits vorhandenen Compiler:

```text
node C:\Users\serka\Desktop\Projekte\wt\P2\frontend\node_modules\typescript\bin\tsc --noEmit -p frontend
```

Der Compilerpfad wurde über die vorhandene Modulauflösung ermittelt; Änderungen erfolgten ausschließlich in diesem Worktree. Die npx-Aufrufe blieben ohne Ergebnis und wurden abgebrochen; es wurde nichts installiert.

Testprotokoll: `C:\Users\serka\dev\_reports\auftraege\U0g-frontend-tests-final.log`.

## LINT

`npm.cmd run lint --prefix frontend` — Exit 0. Ergebniszeile wörtlich:

```text
✖ 9 problems (0 errors, 9 warnings)
```

Alle neun Warnungen liegen in unveränderten Dateien: configActions.ts, paymentActions.ts, waitlistActions.ts und HeroLab.tsx. Keine neue Lint-Warnung. Protokoll: `C:\Users\serka\dev\_reports\auftraege\U0g-lint-final.log`.

`git diff --check`: keine Whitespace-Fehler.

## Vorschau-URLs

Nur bei einem lokalen Development-Server erreichbar; Port gegebenenfalls anpassen. Die Viewport-Größe kommt vom Browser, ein Mobil-Queryparameter ist nicht erforderlich.

Index: http://localhost:3000/dev/admin-vorschau

| Screen | Fixtures | Leerzustand |
| --- | --- | --- |
| Dashboard | http://localhost:3000/dev/admin-vorschau/dashboard | http://localhost:3000/dev/admin-vorschau/dashboard?leer=1 |
| Camp-Detail | http://localhost:3000/dev/admin-vorschau/camp | http://localhost:3000/dev/admin-vorschau/camp?leer=1 |
| Camp anlegen | http://localhost:3000/dev/admin-vorschau/camp-neu | http://localhost:3000/dev/admin-vorschau/camp-neu?leer=1 |
| Camp-Konfiguration | http://localhost:3000/dev/admin-vorschau/camp-konfiguration | http://localhost:3000/dev/admin-vorschau/camp-konfiguration?leer=1 |
| Zahlungen | http://localhost:3000/dev/admin-vorschau/zahlungen | http://localhost:3000/dev/admin-vorschau/zahlungen?leer=1 |
| Warteliste | http://localhost:3000/dev/admin-vorschau/warteliste | http://localhost:3000/dev/admin-vorschau/warteliste?leer=1 |
| Aufgaben | http://localhost:3000/dev/admin-vorschau/aufgaben | http://localhost:3000/dev/admin-vorschau/aufgaben?leer=1 |
| Organisation | http://localhost:3000/dev/admin-vorschau/konfiguration | http://localhost:3000/dev/admin-vorschau/konfiguration?leer=1 |

## Ausgelagerte Komponenten

Unter `frontend/app/components/saas/screens/`:

- OrgDashboardScreen.tsx
- CampDetailScreen.tsx
- CampCreateScreen.tsx
- CampConfigScreen.tsx
- OrgPaymentsScreen.tsx
- OrgWaitlistScreen.tsx
- OrgTasksScreen.tsx
- OrgConfigScreen.tsx

Gemeinsamer Layout-Rahmen: `frontend/app/components/saas/shell/AdminShell.tsx`.
Zusätzlich neu: EmptyCampScreen.tsx, gemeinsame Props-Typen sowie AdminPreviewContext/AdminLink und der lokale PreviewProvider.

Unabhängiger Read-only-Review einschließlich der Windows-Testkonfiguration: keine Findings. Basis-SHA: `efd84e4178e2f5ef353fc40be3054353ea9bde48`; Änderungen sind uncommittet.

## NICHT_AUSGEFÜHRT

- Backend-Testlauf nicht durchführbar: Startversuch mit `REVIEW_POSTGRES_PORT=55443` und `C:\Users\serka\AppData\Local\Programs\Python\Python313\python.exe -m pytest backend_saas/tests -q` scheitert vor Testbeginn an Windows „Zugriff verweigert“. Keine Backend-Änderungen.
- Keine Production-Builds und keine manuelle Browserabnahme; keinen Development-/Watch-Server gestartet.
- Kein npm install, kein pip install, kein Deployment, keine produktiven Datenzugriffe.
- Kein git add, kein git commit, kein Push. Commit übernimmt der Orchestrator.
