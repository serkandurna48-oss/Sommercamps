feat/cx2-preis-faq

STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend` — Exitcode 0, kein fehlgeschlagener Test. Ergebniszeilen wörtlich:

```text
 Test Files  68 passed (68)
      Tests  680 passed (680)
   Start at  18:22:58
   Duration  16.89s (tests 42%, import 24%, transform 18%, worker 9%, environment 8%)
```

`npx tsc --noEmit -p frontend` — keine Ausgabe, keine Fehler, Exitcode 0. Die zusätzliche Exitcode-Ausgabe des Prüfaufrufs lautet wörtlich:

```text
TSC_EXIT_CODE=0
```

- Marketingtests: 15 bestanden, darunter sechs neue Tests für CX2.
- `git diff --check`: erfolgreich, keine Ausgabe.
- Browserprüfung auf lokalem `/campspilot` bei 1440 und 390 Pixeln: sechs native Aufklappelemente, Öffnen per Enter und Schließen per Leertaste, Preislink zu `#pilot`, kein horizontaler Überlauf. Mobile Darstellung einspaltig.
- Gemessener Textkontrast: Preisüberschrift und Preisbutton 16,25:1; Preistext 7,99:1; FAQ-Überschrift und Fragen 16,36:1; Antworten 7,90:1.
- Unabhängiger Lesereview: keine blockierenden Befunde. Den Hinweis zur Position eines Testkommentars korrigiert.
- Basis-SHA: `9c80618666024235732db1b0b0abbfa5a753763c`; geprüft wurde der uncommittete Arbeitsstand dieses Worktrees.

Prüfbelege liegen in `C:\Users\serka\dev\_reports\CX2`: `tests.log`, `typecheck.log` (leer bei Erfolg), `mutation-preis.log`, `mutation-fragen.log`, `browser-1440.json`, `browser-390.json`. FullPage-Aufnahmen: `before-1440.png`, `before-390.png`, `after-1440.png`, `after-390.png`; Detailaufnahmen: `preis-1440.png`, `preis-390.png`, `fragen-open-1440.png`, `fragen-open-390.png`. Die Detailaufnahmen wurden visuell geprüft.

Prüfumgebung: PowerShell blockiert die npm-/npx-PS1-Starter; die geforderten Befehle liefen über `cmd.exe`. Für den TypeScript-Aufruf wurde `frontend/node_modules/.bin` dem Prozess-PATH vorangestellt. `npm ci` scheiterte am gesperrten globalen Cache bzw. Netzwerkzugriff. Deshalb wurden vorhandene Pakete aus `wt/P2/frontend/node_modules` lokal in diesen Worktree kopiert; Paketmanifest und Lockfile blieben unverändert. Beim Versionsabgleich waren die vorhandenen Pakete außer dem transitiven `axe-core` identisch zum Lockfile (`4.14.0` statt `4.11.4`); optionale WASM-Pakete fehlen. Die oben genannten Tests und der Typecheck liefen mit dieser lokalen Installation erfolgreich.

## MUTATIONSPROBE

Nacheinander ausschließlich `id="preis"` in `id="preis-mutation"` und `id="fragen"` in `id="fragen-mutation"` geändert. Jeweils den betreffenden Ankertest aus `marketing.test.tsx` mit Vitest ausgeführt. Beide Läufe endeten mit Exitcode 1 und der erwarteten Assertion:

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

- `frontend/app/(marketing)/campspilot/page.tsx`: Preisabschnitt und sechs native `details`/`summary`-Einträge vor Pilot ergänzt; Abschnitte über Überschriften zugänglich benannt. Vorhandene Marketingklassen sowie `data-rise` und `data-split` wiederverwendet.
- `frontend/app/(marketing)/campspilot/marketing.css`: gekapselte Preisbutton- und FAQ-Regeln ergänzt. Neue Maß-, Schrift- und Farbwerte ausschließlich als Variablen im bestehenden Tokenblock; vorhandene Farben wiederverwendet.
- `frontend/app/(marketing)/campspilot/marketing.test.tsx`: eindeutige Anker, Überschriftenzuordnung, Preisposition und -text, CTA, keine numerischen Europreise, sechs Fragen, native Struktur, höchstens zwei Antwortsätze sowie Zahlungsbegriffe ausschließlich im negativen Satz abgesichert.
- `UEBERGABE-CX2.md`: diese Übergabe.

Die Faktenliste enthält keine Freigabe für eine Mehrstandortfunktion. Deshalb bittet die entsprechende Antwort um Klärung in der Pilotanfrage und verspricht keine Funktion.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge, Deployment oder Versand einer Pilotanfrage.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `PilotRequestForm.tsx` oder `backend_saas/**`.
- Keine Produktionszugriffe, keine neuen Abhängigkeiten im Manifest oder Lockfile.
- Kein Produktionsbuild, kein vollständiger KSV-/JK-Regressionslauf und kein remote SHA-Abgleich: dieser Auftrag liefert ausschließlich einen lokalen, uncommitteten Marketingstand für den Orchestrator.
- Google Fonts waren lokal nicht erreichbar; Screenshots verwenden die vorhandenen Ersatzschriften und reduzierte Bewegung. Die endgültige Darstellung mit heruntergeladenen Webfonts wurde nicht geprüft.
- Kein Geschmackstraining/Stil-Duell: der konkrete Auftrag verlangt Umsetzung ohne Rückfragen; die Gestaltungsvorgaben wurden durch bestehende Klassen, aufklappbare FAQ, Tokenwerte, Screenshots und Kontrastmessung umgesetzt.
