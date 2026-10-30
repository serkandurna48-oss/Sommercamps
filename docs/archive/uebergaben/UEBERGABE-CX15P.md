feat/cx15p-admin-mobil
STATUS: fertig zur Prüfung

TESTS

`npm run test --prefix frontend` – Ergebniszeilen unverändert:
```text
 Test Files  81 passed (81)
      Tests  846 passed (846)
```
0 fehlgeschlagen, einschließlich CX11 und CX12. Protokoll: `.qa-cx15/tests-final.log`.

`npx tsc --noEmit -p frontend` – keine Ausgabe, keine TypeScript-Fehler. Ergebnis des Prozessaufrufs:
```text
Exitcode: 0
```
Protokoll: `.qa-cx15/tsc-final.log`. Unter Windows wurden die gleichnamigen `.cmd`-Starter verwendet, da PowerShell die `.ps1`-Starter sperrt.

`npx playwright test --config e2e/cx15.config.ts` – Ergebniszeilen unverändert:
```text
Kontrast Minimum: 4.84:1
  31 passed (57.0s)
```
Exitcode: 0. Protokoll: `.qa-cx15/browser-first.log`.

- Karten bei 390 und 639 px: Name, Camp/Zeitraum, lesbare Statuschips, volle Breite der Hauptaktion, mindestens 44 px Höhe, kein horizontaler Seitenüberlauf.
- Tastatur: Enter/Leertaste, Tab einschließlich CX12-IBAN-Hinweis, Bestätigung, Escape mit Fokusrückgabe und Außenklick. Suche und Filter bleiben mobil sticky.
- 15 Desktopvergleiche bei 640/1024/1440 px gegen die unveränderte CX15P-Basis: Spalten, Slotgeometrie, Texte und Positionen sämtlicher sichtbarer Aktionsbuttons. Die ursprünglichen Listen sind CSS-Raster, keine HTML-Tabellen; Spaltenüberschriften bleiben daher `[]`.
- Neue Integrationstests: Erinnerung im Overflow, primärer Zahlungsbutton außerhalb, Kopiererfolg und manueller Fallback, Sammelkopie sowie Elternadressen/BCC und mobile Mehrfachauswahl.
- ESLint für alle geänderten Admin-Komponenten und Komponententests: Exitcode 0. `git diff --check`: ohne Befund.
- Unabhängiger Abschlusscheck: kein verbleibender Befund. Die zunächst veraltete Tab-Erwartung und die CX15-Desktop-Baselines wurden an CX12 beziehungsweise die aktuelle Basis angepasst.

MUTATIONSPROBE

`node e2e/cx15-mutation.cjs` entfernt vorübergehend `{label}` aus beiden Varianten von `StatusChip`. Erwartetes ROT:
```text
 Test Files  1 failed (1)
      Tests  5 failed | 5 skipped (10)
AssertionError: expected '' to be 'Bezahlt' // Object.is equality
```
Bezahlt, Offen, Storniert, Warteliste und Erlassen werden erkannt. Protokoll: `.qa-cx15/mutation-red.log`. Die Originaldatei wurde im `finally` wiederhergestellt; `StatusChip.tsx` ist unverändert. Anschließend vollständiger Testlauf grün.

ÄNDERUNGEN

- Den Diff `871570f..feat/cx15-admin-mobil -- frontend` gelesen und auf die aktuelle Basis übertragen. Keine Übernahme älterer Fassungen von CX11/CX12: Elternadressen mit BCC-Hinweis, Wartelistenoption, Kopierfallback und Exportverhalten bleiben erhalten.
- Anmeldungen auf Vereins- und Campebene, Zahlungen und beide Wartelisten erhalten unter 640 px das freigegebene Kartenlayout. Bestehende Props liefern Camp/Zeitraum; keine weitere Datenabfrage und keine neue Abhängigkeit.
- CX12: „Erinnerung kopieren“ liegt mobil im Overflow neben Verwendungszweck und Erlassen. „Als bezahlt markieren“ bleibt der breite Hauptbutton. Desktop behält die sichtbare Reihenfolge Erinnerung/Zahlung/Erlassen. Sammelliste, fehlende IBAN, Fallback, Zahlungsbestätigung, Rückgängig und Erstattung bleiben erhalten.
- CX15-Komponenten- und Browsertests sowie Capture- und Mutationsskripte übernommen. Playwright-Dateien liegen ausschließlich unter `e2e/`. Baselines wurden gegen HEAD `1fba7a136fccfa6ca2c85b4ba1a22a2cda38e8be` neu aufgenommen; sie enthalten somit CX11/CX12. Bei Aktionsgruppen wird die DOM-Textreihenfolge normalisiert, während die sichtbare Buttonreihenfolge über exakte Positionen geprüft wird.
- Ein bereits in der Basis vorhandener TypeScript-Fehler wurde minimal korrigiert: Die Mock-Fixture in `frontend/app/pilot/[org]/hero-scrim.test.tsx` erhält das inzwischen erforderliche `galleryAltTexts: {}`. Keine Änderung am Hero-Produktcode.
- Vollseitenscreenshots vorher/nachher für sechs Ansichten bei 390 und 1440 px: `.qa-cx15/before/` und `.qa-cx15/after/`. Zusätzlich nichtleere Vereins-Anmeldungen mit synthetischen Daten. QA-Artefakte sind lokal von Git ausgeschlossen.
- Gestaltung gemäß GESCHMACK: vorhandene Theme-/Statusfarben, zentrale CSS-Variablen, lesbarer Textkontrast und keine neuen Vereinsinhalte. Admintexte verwenden „Sie“.

NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` oder `backend_saas/**`.
- Kein Zugriff auf Produktivdaten, keine Datenbanktests und kein Mailversand. Browserprüfung ausschließlich lokal mit synthetischen Vorschauen.
- Keine KSV-/JK-Produktionsbuilds und keine Prüfung in Safari/Firefox. Geprüft wurde Chromium.
- Google-Fonts konnten im eingeschränkten Netzwerk nicht geladen werden; Vorher-/Nachher-Aufnahmen verwenden dieselben Fallback-Schriften.
