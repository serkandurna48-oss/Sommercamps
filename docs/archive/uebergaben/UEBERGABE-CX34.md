feat/cx34-selbststart-marketing
STATUS: fertig zur Prüfung

UMSETZUNG:
- „Verein registrieren“ ist auf Marketing- und Preisseite die primäre Aktion und führt zur bestehenden Route `/campspilot/registrieren` aus S1c/S2b. „Unverbindlich anfragen“ bleibt sekundär; Paket-Anfragen behalten ihren Paketparameter.
- Beide Seiten verwenden gemeinsame Paketkarten und den Abschnitt „So starten Sie“ mit genau drei geordneten Schritten: Konto anlegen und E-Mail bestätigen; zur manuellen Prüfung einreichen und freischalten lassen; Camp anlegen, veröffentlichen und Anmeldelink teilen.
- Die Start-FAQ in `pakete.ts` beschreibt denselben Ablauf. Keine neue Zeitgarantie oder Verknappung; die bisherige Aussage über wenige Pilotplätze wurde entfernt.
- Preise, Paketumfang und übrige Paketdaten bleiben unverändert. Neue Preisseite nutzt die vorhandenen Marketing-Stile und das vorhandene Layout.
- Basis-SHA: `0d97467e09a5b1830942f6f9d1cbb7ac814d8039`; Änderungen liegen uncommittet im angegebenen Worktree.

TESTS:

`npm run test --prefix frontend` — unter Windows mit `npm.cmd` ausgeführt. Vollständiger Lauf auf dem finalen Quellstand vor der temporären Mutation; danach wurde dieselbe Datei bytegenau wiederhergestellt. Ergebniszeilen wortgetreu aus `.qa-cx34/tests-full.log`:

```text
 Test Files  98 passed (98)
      Tests  1077 passed (1077)
Command exit code: 0
```

`npx tsc --noEmit -p frontend` — unter Windows mit `npx.cmd` ausgeführt. Keine Compilerdiagnosen; Ergebniszeile aus `.qa-cx34/tsc-final.log`:

```text
Command exit code: 0
```

- Neue Vitest-Tests verwenden den bestehenden Stil mit `renderToStaticMarkup` und jsdom, ohne Testing Library. Sie prüfen beide Seiten, primäre Links, sekundäre Paket-Anfragen, exakt drei Schritte in Reihenfolge und die Start-FAQ.
- `git diff --check`: Exit 0. Unabhängiger Code-Review: keine relevanten Befunde, siehe `.qa-cx34/review.log`.
- Ergänzender ESLint-Check: nach langer Laufzeit ohne Ergebnis abgebrochen; kein erfolgreicher Lint-Abschluss behauptet. Die angeforderten Vitest- und TypeScript-Prüfungen sind unabhängig davon erfolgreich abgeschlossen.

MUTATIONSPROBE:

- Tatsächlich ausgeführte Änderung: primärer Hero-Link auf `/campspilot` vorübergehend auf `/` gesetzt.
- Reproduzierbares Skript: `.qa-cx34/mutation.cjs`; vollständiges Rot-Log: `.qa-cx34/mutation-red.log`.

```text
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
AssertionError: expected '/' to be '/campspilot/registrieren' // Object.is equality
Command exit code: 1
```

- Anschließend automatisch zurückgenommen. `.qa-cx34/mutation-restored.log`: `Original page restored byte-for-byte: true`.
- Grünlauf nach Rücknahme: `npm run test --prefix frontend -- selbststart.test.tsx`, Log `.qa-cx34/mutation-green.log`, Ergebniszeilen wortgetreu:

```text
 Test Files  1 passed (1)
      Tests  9 passed (9)
Command exit code: 0
```

- Ein erster Filteraufruf fand wegen Windows-Anführungszeichen keine Tests und zählt ausdrücklich nicht als Mutationsnachweis; separat erhalten in `.qa-cx34/mutation-filter-error.log`.

SEITEN:
- `/campspilot`: Navigation, Hero, Fußballschulbereich, Paketkarten und Abschlussbereich mit Registrierungs-CTA; neue Startschritte; Link zur Preisübersicht.
- `/preise`: neue eigenständige Seite mit denselben Paketen, Startschritten und FAQ.
- `/campspilot/registrieren`: bestehendes Ziel, unverändert. Vorhandenes Routing lässt `/preise` passieren; keine Proxy-/Konfigurationsänderung erforderlich.
- FullPage-Screenshots in `.qa-cx34/`: `campspilot-before-1440.png`, `campspilot-before-390.png`, `campspilot-after-1440.png`, `campspilot-after-390.png`, `preise-after-1440.png`, `preise-after-390.png`. Vorher gab es für `/preise` nur Paketdaten, keine Seite; deshalb dort kein Vorher-Screenshot.
- Browserprüfung als lokale SSR-Vorschau aus echten Komponenten und CSS, mit Arial-Ersatzschrift und ohne Motion; kein laufender Next-Server. Kein horizontaler Überlauf bei 1440 oder 390 Pixeln; Ergebnisse in `visual-results.json`, reproduzierbar mit `visual-check.cjs`.
- Textkontraste berechnet: mindestens 4,76:1 für die geprüften neuen/wiederverwendeten Kombinationen; Werte in `.qa-cx34/contrast.log`. Bestehende Designvariablen und Pill-Buttons weiterverwendet.

NICHT_AUSGEFÜHRT:
- Kein `npm install`, keine neuen Abhängigkeiten.
- Kein `git add`, Commit, Push, Merge oder Deploy; der Orchestrator übernimmt den Commit.
- Kein Produktionszugriff, keine echte Registrierung, keine E-Mail und keine Backendänderung.
- Kein Next-Produktionsbuild oder KSV-/JK-Doppelbuild; keine Prüfung gegen ein Live-Deployment. Die Browserprüfung ist die oben beschriebene SSR-Vorschau.
- Alle untersagten Dateien und Verzeichnisse bleiben unverändert. Sämtliche Playwright-Artefakte dieses Auftrags liegen ausschließlich unter `.qa-cx34/`, außerhalb von `frontend/`.
