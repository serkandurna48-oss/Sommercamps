feat/cx2-preis-faq

STATUS: fertig zur Prüfung

Nachbesserung vom 24.10.2026: Der einzige offene Befund aus `C:\Users\serka\dev\_reports\auftraege\REVIEW-J-CX2-runde1.md` war die fehlende Datei `C:\Users\serka\dev\_reports\CX2\typecheck.log`. Der Typecheck wurde erneut ausgeführt; die Datei wurde mit Prüfkommando und tatsächlichem Exitcode erstellt und anschließend eingelesen. Der Befund ist behoben. Eine Datei namens `REVIEW-J-CX2.md` liegt im Worktree nicht vor; die vorhandene Übergabe trug bereits `STATUS: fertig zur Prüfung`, nicht `blockiert`.

## TESTS

`npm run test --prefix frontend` — Exitcode 0, kein fehlgeschlagener Test. Ergebniszeilen wörtlich:

```text
 Test Files  68 passed (68)
      Tests  680 passed (680)
   Start at  18:49:52
   Duration  36.70s (tests 37%, import 30%, transform 12%, environment 12%, worker 9%)
```

`npx tsc --noEmit -p frontend` — keine Compiler-Ausgabe, keine Fehler, Exitcode 0. Der gespeicherte Prüfbeleg `typecheck.log` enthält wörtlich (Kommando und Exitcode vom Prüfskript ergänzt):

```text
COMMAND=npx tsc --noEmit -p frontend
TSC_EXIT_CODE=0
```

- Marketingtests: 15 bestanden, darunter sechs neue Tests für CX2.
- `git diff --check`: Exitcode 0, keine Whitespace-Fehler; Git meldet lediglich die künftige LF-/CRLF-Konvertierung der Übergabe.
- Browserprüfung aus dem vorherigen Durchlauf, vom vorliegenden Judge-Review bestätigt: lokales `/campspilot` bei 1440 und 390 Pixeln, sechs native Aufklappelemente, Öffnen per Enter und Schließen per Leertaste, Preislink zu `#pilot`, kein horizontaler Überlauf. Mobile Darstellung einspaltig.
- Vorhandene Kontrastbelege erneut eingelesen: Preisüberschrift und Preisbutton 16,25:1; Preistext 7,99:1; FAQ-Überschrift und Fragen 16,36:1; Antworten 7,90:1.
- Judge-Review: Code, Tests, Mutationsproben, Screenshots und Kontrastmessungen bestätigt; fehlender Typecheck-Beleg in diesem Durchlauf ergänzt.
- Geprüfter SHA: `6cf9856a4f47e4c628753e9af3cd772a06f03e01` auf `feat/cx2-preis-faq`; Anwendungscode unverändert. Nur diese Übergabe wird im Worktree geändert.

Prüfbelege liegen in `C:\Users\serka\dev\_reports\CX2`: `tests.log`, `typecheck.log` (mit Kommando und Exitcode), `mutation-preis.log`, `mutation-fragen.log`, `browser-1440.json`, `browser-390.json`. FullPage-Aufnahmen: `before-1440.png`, `before-390.png`, `after-1440.png`, `after-390.png`; Detailaufnahmen: `preis-1440.png`, `preis-390.png`, `fragen-open-1440.png`, `fragen-open-390.png`. Alle Dateien sind vorhanden. Tests, Typecheck und Mutationsproben wurden in diesem Durchlauf erneuert; die unveränderten Browserbelege und Aufnahmen stammen aus dem vorherigen Durchlauf und wurden dort bzw. im Judge-Review geprüft.

Prüfumgebung: Die geforderten Befehle liefen über `cmd.exe`. Für den TypeScript-Aufruf wurde `frontend/node_modules/.bin` dem Prozess-PATH vorangestellt. Die vorhandene lokale Paketinstallation wurde weiterverwendet; keine Installation in diesem Durchlauf. Laut vorheriger Übergabe stammen die Pakete aus `wt/P2/frontend/node_modules`, weil `npm ci` am gesperrten Cache bzw. Netzwerkzugriff scheiterte. Dort wurde beim Versionsabgleich eine Abweichung beim transitiven `axe-core` (`4.14.0` statt `4.11.4`) sowie das Fehlen optionaler WASM-Pakete festgestellt. Paketmanifest und Lockfile blieben unverändert; Tests und Typecheck liefen mit dieser Installation erfolgreich.

## MUTATIONSPROBE

In diesem Durchlauf erneut nacheinander ausschließlich `id="preis"` in `id="preis-mutation"` und `id="fragen"` in `id="fragen-mutation"` geändert. Jeweils den betreffenden Ankertest aus `marketing.test.tsx` mit Vitest ausgeführt. Beide Läufe endeten mit Exitcode 1 und der erwarteten Assertion:

```text
AssertionError: expected  to have a length of 1 but got +0
```

Ergebniszeilen je Mutation wörtlich:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
```

Betroffene Tests:

- `Anker #preis existiert genau einmal`
- `Anker #fragen existiert genau einmal`

Anschließend beide Originalanker wiederhergestellt und die vollständige Testsuite erfolgreich ausgeführt. Keine Mutation verblieben.

## TEXTE wörtlich

### Preis

Der Preis richtet sich nach der Zahl Ihrer Camps. Für die ersten Vereine ist die Einrichtung inklusive.

Button: Preis anfragen

Ziel: `#pilot`

### Häufige Fragen

**Wie lange dauert die Einrichtung?**

Sie legen Ihren Verein selbst an und durchlaufen einen Einrichtungsassistenten in vier Schritten. Anschließend prüft CampsPilot Ihre Angaben und gibt Ihren Verein innerhalb eines Werktags frei.

**Brauchen Eltern ein Konto?**

Nein, Eltern melden ihr Kind ohne Konto in etwa vier Minuten an.

**Wie kommt das Geld zu uns?**

Eltern überweisen direkt an Ihren Verein mit einem persönlichen Verwendungszweck je Anmeldung; Zahlungseingänge haken Sie in der Liste ab. Eine Online-Zahlung per Kreditkarte ist derzeit nicht möglich.

**Was passiert mit den Daten?**

Einwilligungen zu Teilnahmebedingungen, Datenschutz und Fotos werden mit Zeitstempel gespeichert. Die Daten werden nur für die Camp-Anmeldung verarbeitet.

**Können wir mehrere Standorte anbieten?**

Bitte sprechen Sie Ihren Bedarf an mehreren Standorten in der Pilotanfrage an.

**Was, wenn ein Camp voll ist?**

Es gibt eine Warteliste mit Nachrücken.

## ÄNDERUNGEN

Nachbesserung in diesem Durchlauf:

- `C:\Users\serka\dev\_reports\CX2\typecheck.log`: fehlenden Prüfbeleg mit echtem Typecheck-Ergebnis erstellt und Inhalt geprüft.
- Test- und Mutationsprobenprotokolle im selben Berichtsordner erneuert.
- `UEBERGABE-CX2.md`: Befund, aktueller SHA und aktuelle Ergebniszeilen dokumentiert.
- Keine dauerhaften Änderungen am Anwendungscode; beide Mutationen bytegenau zurückgesetzt.

Bereits vorhandene Umsetzung, vom Orchestrator in `6cf9856` committet:

- `frontend/app/(marketing)/campspilot/page.tsx`: Preisabschnitt und sechs native `details`/`summary`-Einträge vor Pilot ergänzt; Abschnitte über Überschriften zugänglich benannt. Vorhandene Marketingklassen sowie `data-rise` und `data-split` wiederverwendet.
- `frontend/app/(marketing)/campspilot/marketing.css`: gekapselte Preisbutton- und FAQ-Regeln ergänzt. Neue Maß-, Schrift- und Farbwerte ausschließlich als Variablen im bestehenden Tokenblock; vorhandene Farben wiederverwendet.
- `frontend/app/(marketing)/campspilot/marketing.test.tsx`: eindeutige Anker, Überschriftenzuordnung, Preisposition und -text, CTA, keine numerischen Europreise, sechs Fragen, native Struktur, höchstens zwei Antwortsätze sowie Zahlungsbegriffe ausschließlich im negativen Satz abgesichert.
- `UEBERGABE-CX2.md`: diese Übergabe.

Die Faktenliste enthält keine Freigabe für eine Mehrstandortfunktion. Deshalb bittet die entsprechende Antwort um Klärung in der Pilotanfrage und verspricht keine Funktion.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge, Deployment oder Versand einer Pilotanfrage.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `PilotRequestForm.tsx` oder `backend_saas/**`.
- Keine Produktionszugriffe, keine neuen Abhängigkeiten im Manifest oder Lockfile.
- Kein Produktionsbuild, kein vollständiger KSV-/JK-Regressionslauf und kein remote SHA-Abgleich: dieser Nachbesserungslauf liefert lokale Prüfbelege und eine uncommittete Übergabe für den Orchestrator.
- Keine erneute Browserprüfung oder neue Screenshots: Anwendungscode und Gestaltung bleiben unverändert; vorhandene Belege sind im Judge-Review bestätigt.
- Google Fonts waren lokal nicht erreichbar; Screenshots verwenden die vorhandenen Ersatzschriften und reduzierte Bewegung. Die endgültige Darstellung mit heruntergeladenen Webfonts wurde nicht geprüft.
- Kein Geschmackstraining/Stil-Duell: der konkrete Auftrag verlangt Umsetzung ohne Rückfragen; die Gestaltungsvorgaben wurden durch bestehende Klassen, aufklappbare FAQ, Tokenwerte, Screenshots und Kontrastmessung umgesetzt.
