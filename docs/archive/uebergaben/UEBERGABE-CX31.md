feat/cx31-preise

STATUS: fertig zur Prüfung

## SEITE

Bestehenden Preisabschnitt auf **`/campspilot#preis`** überarbeitet. Deshalb keine zusätzliche `/preise`-Seite angelegt.

- Drei Pakete: Start 199 €, Verein 490 €, Fußballschule 990 € pro Jahr, mit den beauftragten Camp-Grenzen und jeweils fünf Leistungen.
- Alle Preisbeträge, Pakettexte, FAQ, Anfragebeschriftung und Nachrichtenvorlage zentral in `frontend/app/(marketing)/preise/pakete.ts`.
- `entwurf: true` zeigt „Preise gültig für die Saison 2027“. MwSt.-Hinweis vollständig sichtbar.
- Sechs native `details`/`summary`-FAQ in Sie-Ansprache. Testphase und Kündigung neutral; EU-Hosting ausdrücklich auf Anmeldedaten bezogen.
- „Preise“ in Navigation und Footer, auch in der kompakten Mobilnavigation erreichbar.
- Anfragebuttons führen zu `/campspilot?paket=<Paketname>#pilot`. Bekannte Pakete füllen das bearbeitbare Nachrichtenfeld vor; unbekannte Parameter werden ignoriert.
- Widersprechende bisherige Pilotbegrenzung „ein bis zehn Camps“ durch neutralen Anfragetext ersetzt.

## TESTS

`npm run test --prefix frontend` — unter Windows als `npm.cmd` ausgeführt. Abschließender Gesamtlauf nach Mutationsprobe und Wiederherstellung der Screenshot-Baseline, Ergebniszeilen wörtlich:

```text
 Test Files  89 passed (89)
      Tests  947 passed (947)
   Start at  00:42:50
   Duration  75.32s (tests 46%, import 25%, environment 15%, transform 8%, worker 6%)

Exit code: 0
```

**0 fehlgeschlagene Tests.** Vollständiges Log: `.qa-cx31/test-final.log`.

`npx tsc --noEmit -p frontend` — als `npx.cmd --no-install tsc --noEmit -p frontend` ausgeführt; der zusätzliche Schalter verhindert Paketinstallationen. Keine Compilerdiagnosen; protokollierte Ergebniszeile wörtlich:

```text
Exit code: 0
```

Log: `.qa-cx31/typecheck.log`.

Weitere Prüfungen:

- Gezielte Marketing-/Formulartests: 2 Dateien, 33 Tests bestanden (`.qa-cx31/targeted-green.log`).
- ESLint für alle fünf geänderten/neuen TypeScript-Dateien aus dem Frontend-Verzeichnis: Exit code 0 (`.qa-cx31/lint-frontend.log`).
- `git diff --check`: Exit code 0. Geschützte Pfade: 0 Änderungen.
- Unabhängiger statischer Review durch zweiten Agenten gemäß CLAUDE.md: keine blockierenden Befunde.
- Browserprüfung mit vorhandenem Playwright/Edge bei 1440 und 390 px: keine horizontale Überbreite, Paketübernahme ins Formular und FAQ-Aufklappen erfolgreich (`.qa-cx31/visual.json`). Kein echtes Formular abgesendet.
- Berechneter Textkontrast der verwendeten Farbkombinationen: mindestens 5,49:1 (`.qa-cx31/contrast.json`).

Screenshots unter `.qa-cx31/`: `before-1440.png`, `before-390.png`, `after-1440.png`, `after-390.png`; Ausschnitte des Preisabschnitts: `preise-1440.png`, `preise-390.png`.

Die Vorher-Aufnahmen wurden nachträglich mit den unveränderten HEAD-Versionen von Seite, CSS und Formular erstellt. Anschließend wurden die Arbeitsdateien byteidentisch wiederhergestellt; SHA-256-Nachweis: `.qa-cx31/baseline-restore.json`. Originale Webfonts waren lokal wegen nicht erreichbarer Google-Fonts-Ressourcen nicht verfügbar; die Aufnahmen verwenden Ersatzschriften.

## MUTATIONSPROBE

Die gerenderte Zeile `<p className="price-tax">{preise.steuerhinweis}</p>` vorübergehend entfernt. Der gezielte Test prüft den vollständigen MwSt.-Text unabhängig vom Datenexport.

Rot, wörtlich aus `.qa-cx31/mutation-red.log`:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
Exit code: 1
```

Zeile wiederhergestellt, anschließend grün; wörtlich aus `.qa-cx31/mutation-green.log`:

```text
 Test Files  1 passed (1)
      Tests  1 passed | 16 skipped (17)
Exit code: 0
```

Vorher-/Nachher-Hash identisch (`.qa-cx31/mutation-restore.json`). Wiederholbares Skript: `.qa-cx31/mutation.cjs`. Sämtliche Playwright-Skripte dieses Auftrags liegen ausschließlich unter `.qa-cx31/`, nicht unter `frontend/`.

## NICHT_AUSGEFÜHRT

- Kein `npm install`, keine neuen Abhängigkeiten. Die im Worktree fehlende `frontend/node_modules`-Verknüpfung wurde auf die bereits vorhandene gemeinsame Installation in `wt/P2/frontend/node_modules` eingerichtet.
- Kein `git add`, Commit, Push, Merge oder Deployment. Änderungen verbleiben für den Orchestrator im Arbeitsbaum.
- Keine Produktionszugriffe, echten E-Mails oder Live-Formularübermittlungen.
- Keine KSV-/JK-Produktionsbuilds und kein Remote-SHA-Abnahmecheck; dieser Auftrag endet ausdrücklich vor Commit/Push. Prüfgrundlage: Arbeitsbaum auf Basis von `93ac4479e1b9635409dac7cd8e80ba9e9e435df0`.
- Keine Änderung an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `backend_saas/**`, `frontend/app/pilot/**` oder `frontend/app/platform/**`.

Offen für Serkan: endgültige Freigabe der als Entwurf zentral hinterlegten Preise und Paketleistungen.
