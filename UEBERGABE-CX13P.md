feat/cx13p-geschwister

STATUS: fertig zur Prüfung

## TESTS

Geprüft wurde der uncommittete Arbeitsstand auf Basis `7fd7f6d34bed9ac55ba1ebab427d4e01075a3d4d`. Der Originaldiff `git diff 871570f feat/cx13-geschwister -- frontend` wurde ausschließlich lesend ausgewertet; die Änderungen wurden gezielt in die aktuelle Basis integriert.

`npm run test --prefix frontend` — vollständiger Abschlusslauf nach Entfernung der Mutation, Exit-Code 0, keine fehlgeschlagenen Tests. Ergebniszeilen unverändert:

```text
 Test Files  79 passed (79)
      Tests  808 passed (808)
   Start at  19:44:09
   Duration  24.96s (tests 49%, import 25%, transform 12%, worker 7%, environment 6%)

TEST_EXIT=0
```

`npx tsc --noEmit -p frontend` — keine Compiler-Ausgabe, keine Fehler. Ergebniszeile der aufrufenden Shell unverändert:

```text
TSC_EXIT=0
```

Die Befehle liefen über `cmd.exe /d /c`; für TypeScript wurde `frontend/node_modules/.bin` dem Prozess-PATH vorangestellt. Der Netzwerkdownload durch `npm ci` scheiterte an EACCES; deshalb wurden vorhandene lokale Abhängigkeiten aus dem CX8-Worktree in diesen Worktree kopiert. Keine Änderungen an package.json oder Lockfile, keine neuen Abhängigkeiten.

- Die fünf ursprünglichen CX13-DOM-Tests sind übernommen: zweites/drittes Kind, Campwechsel, Warteliste, Abbruch/erneuter Mount sowie kontaminierte Übergabedaten und Verbrauch der Übergabe.
- Zwei zusätzliche Integrationstests prüfen Kalender/WhatsApp nach erster und zweiter Anmeldung sowie CX8-Fehleranzeige, Datenerhalt, Fokus und Fehlerbereinigung beim Campwechsel. Die ursprünglichen Tests prüfen zusätzlich Überschriftenfokus, Fokus auf die erste fehlende Einwilligung, explizites Label des Camp-Auswahlfelds und ausgeblendete Kalender-/WhatsApp-Aktionen bei Wartelisten-Erfolg.
- Die bestehenden CX3-, CX6- und CX8-Tests sind unverändert und im grünen Gesamtlauf enthalten, einschließlich Not-found-Seite und Statusmeldungen. Vorab gezielter Lauf: 4 Dateien, 39 Tests bestanden.
- ESLint über alle fünf geänderten/neuen TypeScript-Dateien: Exit-Code 0, keine Ausgabe. `git diff --check`: Exit-Code 0.
- Unabhängiges Read-only-Code-Review gemäß CLAUDE.md: keine konkreten Befunde. Ergänzend Komponentenprüfung anhand des Skills `vercel:react-best-practices`.

Protokolle: [Gesamttests](C:/Users/serka/dev/_reports/auftraege/CX13P/tests-final.log), [TypeScript](C:/Users/serka/dev/_reports/auftraege/CX13P/tsc.log).

## MUTATIONSPROBE

Im Initialzustand des Formulars vorübergehend `termsAccepted: Boolean(parentPrefill)` ergänzt. Damit war die Teilnahme-Einwilligung beim weiteren Kind ohne neue Zustimmung gesetzt. `npm run test --prefix frontend -- siblingRegistration` erkannte den tatsächlichen Checkbox-Zustand und wurde rot:

```text
 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)
```

```text
MUTATION_EXIT=1
MUTATION_RESTORED=true
```

Fehler: `expected true to be false`. Die Originaldatei wurde im `finally`-Block bytegenau wiederhergestellt. Danach vollständige Suite und TypeScript erneut erfolgreich geprüft. [Mutationsprotokoll](C:/Users/serka/dev/_reports/auftraege/CX13P/mutation.log).

## ÄNDERUNGEN

- `DoneScreen.tsx`: „Weiteres Kind anmelden“ nach erfolgreicher Anmeldung und Wartelisten-Eintrag ergänzt. Vorhandene Kalender- und WhatsApp-Aktionen bleiben samt bisheriger Wartelisten-Abgrenzung erhalten.
- `ParentFlow.tsx`: Elternangaben über React-Zustand an das neue Formular übergeben; dasselbe Camp vorausgewählt. Rückkehr zur Übersicht oder Abbruch verwirft die Übergabe. Vorhandene Nicht-gefunden- und Nicht-verfügbar-Zustände bleiben erhalten.
- `RegistrationFormScreen.tsx`: Elternname, E-Mail, Telefon, Notfallnummer und Abholpersonen vorausgefüllt. Hinweis „Ihre Angaben aus der letzten Anmeldung – bitte prüfen.“ ergänzt. Kinderfelder, Zusatzantworten und alle drei Einwilligungen starten leer. Bei mehreren Camps erscheint eine explizit beschriftete Auswahl; geschlossene Camps sind deaktiviert. Campwechsel erhält Elternangaben und leert Kinderangaben, Einwilligungen und Fehlerzustände einschließlich `errorStatus`. Bestehende Feldfokussierung, Fehlermeldungen und Wiederholungs-/Kontaktaktionen bleiben erhalten.
- `siblingRegistration.ts`: explizite Laufzeit-Allowlist der fünf Eltern-/Notfallfelder, auch bei zusätzlichen unerlaubten Feldern im Übergabeobjekt.
- `siblingRegistration.test.tsx`: sieben DOM-Ablauftests mit ausschließlich synthetischen Daten.
- `e2e/cx13-browser-check.mjs`: ursprünglichen Browser-Prüfharness außerhalb von `frontend/` übernommen; Ausgabeordner auf CX13P und Next-Auflösung auf die Frontend-Abhängigkeiten angepasst. In diesem Auftrag nicht ausgeführt.

Datenschutz: ausschließlich React-Zustand; kein sessionStorage-Schlüssel, kein localStorage, keine Cookies und keine personenbezogenen URL-Parameter. Die Übergabekopie wird unmittelbar nach Vorbefüllung und zusätzlich bei jedem Submit-Versuch verworfen. Tests prüfen leere Speicher, ausbleibende Storage-/Cookie-Schreibzugriffe und unveränderte URL. Nach erfolgreichem Absenden wird nur die neue Allowlist für ein mögliches weiteres Kind bereitgestellt.

Elterntexte auf Deutsch mit Sie-Anrede. Bestehende Theme-Klassen verwendet; keine neuen Farben, Abstände oder Vereinsinhalte. Keine API- oder Schemaänderung.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment; Commit übernimmt der Orchestrator.
- Keine produktiven Zugriffe, keine Datenbank-/Backendtests, kein Mail- oder WhatsApp-Versand.
- Kein Dev-Server, Browserlauf, neue Screenshots oder Kontrastmessung. Diese Integrationsaufgabe wurde mit Frontend-DOM-Tests geprüft; die bestehenden Gestaltungsklassen wurden übernommen. Die visuellen Belege aus CX13 wurden nicht als neue CX13P-Prüfung ausgegeben.
- Keine KSV-/JK-Produktionsbuilds; geändert wurde ausschließlich der getrennte SaaS-Elternflow, ohne Commit/PR/Merge.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` oder `backend_saas/**`; abschließender Git-Abgleich ohne Diff. Keine Playwright-Dateien unter `frontend/` angelegt.
