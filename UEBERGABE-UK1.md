# Übergabe UK1 – einheitliche Admin-Oberfläche

STATUS: fertig zur Prüfung

Basis: `b8cef35`, Änderungen im aktuellen Worktree. Kein `git add`, kein Commit, kein Push. Keine Backend- oder Datenbankänderungen, keine neuen Abhängigkeiten.

## TESTS

Vollständiger abschließender Lauf: `npm.cmd run test --prefix frontend -- --pool=threads --maxWorkers=1` – Exit 0, **0 failed**. Ergebniszeilen wörtlich:

```text
 Test Files  43 passed (43)
      Tests  398 passed (398)
```

Alle Testdateien wurden mit aktiver Isolation ausgeführt. Die zusätzlichen Optionen begrenzen ausschließlich den Worker-Pool; keine Tests wurden ausgelassen und keine Erwartungen abgeschwächt. Protokoll: `frontend/.next/uk1-audit/tests-final-threads.log`.

Zusätzlich geprüft:

- Glob über sämtliche SaaS-Komponenten, Org-Admin-Routen und Vorschau-Quellen: keine direkten Datums-Locale-Aufrufe außerhalb `lib/i18n/de.ts`, keine eigenen HTML-Buttons außerhalb `ui/Button.tsx`.
- Datumsbereiche einschließlich Monats-/Jahreswechsel und aller zwölf Monatsnamen; Einzeldatum, Uhrzeit, Berliner Mitternacht und Sommerzeit.
- Alle zwölf Vorschau-Seiten mit Daten und im Leerzustand: Kopf, Rückziel, Tab-Namen, Titel, höchstens drei Kennzahlen, Button-Varianten, höchstens eine primäre Aktion pro Karte, Du-Ansprache und Satzzeichen.
- Lade- und Fehleransichten für alle zwölf Admin-Routen; Organisations-API-Ausfall und abgelaufene Anmeldung.
- Abgelehnte und bestätigte Camp-Rücknahme/-Schließung; bestehende Formular-, Zahlungs-, Export-, Stornierungs- und Elternseiten-Tests.
- Browser-Messung: 24 Ansichten bei jeweils 390 und 1280 px, insgesamt 48. Keine horizontalen Seitenüberläufe, alle Tab-Texte einzeilig, keine sichtbaren Buttons unter 44 px. Statische Ansichten mit tatsächlichem React-Screen-Markup und Projekt-CSS, Ersatzschrift statt geladener Google-Schrift; kein vollständiger Next-Lauf. Screenshots und Messdaten unter `frontend/.next/uk1-audit/` (ignorierte lokale Prüfartefakte).
- Unabhängiger lokaler Review abgeschlossen; gefundene Layout-Fehlergrenze und Camp-anlegen-Variante korrigiert und nachgeprüft.
- Nach den letzten Hauptaktions-Änderungen zusätzlich Dashboard, Vereinszahlungen und Camp-Zahlungen bei beiden Breiten geprüft: sechs weitere Ansichten ohne Überläufe oder zu kleine Buttons (`measurements-final-buttons.json`).

## LINT

`npm.cmd run lint --prefix frontend` – Exit 0:

```text
✖ 9 problems (0 errors, 9 warnings)
```

Die neun bestehenden Warnungen betreffen unbenutzte Parameter in Actions sowie Hooks/Parameter in HeroLab. Keine Lint-Fehler.

`npx.cmd tsc --noEmit -p frontend` – Exit 0, keine TypeScript-Fehler.

## Änderungen je Regel

Die folgenden Pfade ohne Präfix liegen unter `frontend/app/components/saas/`.

### 1. Datum

- `frontend/app/lib/i18n/de.ts`, `de.test.ts`: feste deutsche Monatsabkürzungen und Bereichslogik; zentrale `formatDate`, `formatDateTime`, relative Zeitangaben und Berliner Tageskennung.
- `registrationDates.ts`, `screens/OrgDashboardScreen.tsx`, `config/CampPublicationCard.tsx`, `data/TodayRegistrations.tsx`, `data/WaitlistRow.tsx`, `data/DayListPrint.tsx`, `data/ParticipantList.tsx`: zentrale Formatierung für Anzeigen, Druck und Teilnehmer-CSV.
- `adminConsistency.test.ts`, `dailyWorkflow.test.tsx`: Quelltext-Glob und angepasste Erwartungen.

### 2. Kopf und Rücknavigation

- `shell/MatchdayBand.tsx`: ein gemeinsamer kompakter Aufbau; Vereinsidentität/Abmelden, Rücklink, Titel/Untertitel/Kennzahlen. Kein Scroll-Collapse; mobil nicht sticky. Mobil eine Kennzahl, ab Desktop höchstens drei, damit der Kopf kompakt bleibt.
- `shell/AdminShell.tsx`, `shell/OrganizationContext.tsx`, `shell/OrgSwitcher.tsx`, `shell/LogoutButton.tsx`: gemeinsame Identität, Bedienfläche und mobile Größen.
- Sämtliche bestehenden Screens angepasst: `screens/OrgDashboardScreen.tsx`, `OrgPaymentsScreen.tsx`, `OrgWaitlistScreen.tsx`, `OrgTasksScreen.tsx`, `OrgConfigScreen.tsx`, `NewRegistrationsScreen.tsx`, `CampCreateScreen.tsx`, `CampDetailScreen.tsx`, `CampPaymentsScreen.tsx`, `CampWaitlistScreen.tsx`, `CampTasksScreen.tsx`, `CampConfigScreen.tsx`, `EmptyCampScreen.tsx`.
- `screens/AdminRouteState.tsx`, `AdminRouteState.test.tsx`: derselbe Kopf auch beim Laden und bei Fehlern.
- `frontend/app/pilot/[org]/(org-admin)/layout.tsx`, `layout.test.tsx`, `loading.tsx`, `error.tsx`, `dashboard/loading.tsx`, `dashboard/error.tsx`, `camps/[campSlug]/loading.tsx`, `camps/[campSlug]/error.tsx`: Identität und gemeinsame Fallbacks; API-Ausfälle bleiben innerhalb der Fehlergrenze, Auth-Fehler leiten weiterhin zum Login.
- `frontend/app/lib/adminNavigation.test.tsx`: Organisations-Mock für die gemeinsame Identität ergänzt; bestehende Rollen- und Zugriffserwartungen bleiben erhalten.
- `frontend/app/dev/admin-vorschau/preview.test.tsx`: alle Vorschau-Seiten einschließlich Leerzustände prüfen dieselben Screens.

### 3. Tabs und Seitentitel

- `navTabs.ts`, `shell/BandTabs.tsx`, `tokens.css`: feste fünf Bezeichnungen, kurze Einstellungs-Tabs, einzeilige mobile Navigation.
- `screens/CampConfigScreen.tsx`: Seitentitel „Camp-Einstellungen“, Campname und Datum im Untertitel. „Vereinseinstellungen“ bleibt als Seitentitel auf Vereinsebene erhalten.
- `dailyWorkflow.test.tsx`, `screens/AdminRouteState.test.tsx`, `frontend/app/dev/admin-vorschau/preview.test.tsx`: Rückziele, Titel und Tab-Reihenfolge abgesichert.

### 4. Buttons

- `ui/Button.tsx`, `tokens.css`: genau `primary`, `secondary`, `danger`; Navigation über `ButtonLink` mit denselben Varianten, mindestens 44 px.
- `ui/ActionForm.tsx`, `ui/ExportBar.tsx`, `ui/FilterButton.tsx`, `shell/LogoutButton.tsx`, `data/DayListPrint.tsx`, `data/ParticipantRow.tsx`, `data/ParticipantDetail.tsx`, `data/ParticipantList.tsx`: gemeinsame Buttons auch für Bearbeiten, Filter, Export, Druck und Kontaktaktionen.
- `data/PaymentRow.tsx`, `data/PaymentSection.tsx`: Hauptaktion „Als bezahlt markieren“ in kontrastsicherer Vereinsfarbe; beim Bearbeiten eines Teilnehmers bleibt Speichern die einzige primäre Aktion.
- `config/CampConfigForm.tsx`, `config/CampPublicationCard.tsx`, `config/PublishToggle.tsx`: Speichern/Veröffentlichen primär; Zurückziehen/Schließen als Gefahr mit Bestätigung.
- `tasks/TaskCard.tsx`, `tasks/TaskRow.tsx`, `screens/OrgDashboardScreen.tsx`: „Ansehen“ in „Jetzt dran“ und „Camp anlegen“ primär; je Aufgabenkarte nur eine Primäraktion.
- `config/CampConfigForm.test.tsx`, `data/RegistrationActions.test.tsx`, `ui/accessibility.test.tsx`, `adminConsistency.test.ts`, Vorschau-Tests: Bestätigungen, Varianten, Tap-Flächen und Kartenregeln.

### 5. Sprache und Satzzeichen

- `frontend/app/lib/i18n/de.ts`, `actions/configActions.ts`, `actions/configActions.test.ts`, `actions/paymentActions.ts`, `actions/waitlistActions.ts`, `config/CampConfigForm.tsx`, `config/OrganizationConfigForm.tsx`, `config/PublishToggle.tsx`, `data/ParticipantDetail.tsx`: sichtbare Gedankenstriche als „–“.
- `data/WaitlistCard.tsx`: „Bitte informiere die Eltern …“ statt Sie-Anrede.
- Sichtbare Anführungszeichen und Auslassungen in allen Screens/Unterkomponenten geprüft; dynamische freie Vereins-/Personentexte werden nicht umgeschrieben.

## Vollständigkeit der Seitenprüfung

Geprüft: Dashboard, neue Anmeldungen, Vereinszahlungen, Vereinswarteliste, Vereinsaufgaben, Vereinseinstellungen, Camp anlegen, Camp-Übersicht/Teilnehmer, Camp-Zahlungen, Camp-Warteliste, Camp-Aufgaben, Camp-Einstellungen. Dazu: leere Organisation/fehlendes Camp, Teilnehmerdetails und Bearbeiten, Zahlungsaktionen/Bestätigungen, Veröffentlichungszustände, Export-Menü, Druckansicht, Auswahlleiste sowie alle Lade-/Fehler-Fallbacks. Alle produktiven `page.tsx`-Adapter und beide Export-Routen im angegebenen Admin-Bereich wurden in die Quellprüfung einbezogen.

## NICHT_AUSGEFÜHRT / Einschränkungen

- Kein produktiver Backend-/Datenbankzugriff, kein Deployment, kein `git add`, Commit oder Push; kein `npm install`, kein Watch-Modus.
- Produktionsbuilds für KSV und JK wurden versucht, konnten aber wegen der Worktree-Abhängigkeiten nicht abgeschlossen werden: Turbopack findet `next/package.json` vom Projektverzeichnis nicht. npm/TypeScript/Vitest lösen Pakete aus dem vorhandenen gemeinsamen `P2/frontend/node_modules` auf. Kein Repository-Konfigurations- oder Dependency-Workaround eingeführt. Logs: `frontend/.next/uk1-audit/UK1-build-ksv.log` und `UK1-build-jk.log`.
- Daher kein vollständiger Browserlauf mit Next-Hydrierung und den echten Google-Schriften. Die 48 statischen Browseransichten und die interaktiven jsdom-Tests ersetzen diesen Lauf nur teilweise.
- Backend-generierte XLSX-Dateien wurden nicht verändert; das Backend liegt ausdrücklich außerhalb des Auftrags.
- Ein vollständiger Testlauf mit Standardparallelität endete nach rund 26 Minuten mit sechs Worker-Start-Timeouts und zwei Fehlern im bisherigen Organisations-Mock des Navigationstests. Der Mock wurde korrigiert. Der zweite Lauf mit zwei Fork-Workern bestand 315 Tests, konnte aber fünf Dateien wegen Worker-Start-Timeouts nicht ausführen. Der abschließende Lauf mit einem Thread-Worker bestand sämtliche 398 Tests in 43 Dateien ohne Fehler. Das unveränderte Standardkommando wurde nach dieser erfolgreichen vollständigen Prüfung nicht nochmals gestartet. Protokolle: `frontend/.next/uk1-audit/tests-final.log`, `tests-final-limited.log` und `tests-final-threads.log`.
