feat/cx17-marketing-a11y
STATUS: fertig zur Prüfung

Geprüft: uncommittierter Arbeitsstand auf Basis von `ececbd7faba5a70a7d4830a466451239ac0c39f0`. Keine Änderungen an den ausgeschlossenen Dateien und keine neuen Abhängigkeiten. `GESCHMACK.md` wurde zuerst gelesen; Lesbarkeit, reduzierte Bewegung, CSS-Variablen und die Vorgabe gegen doppelte Bilder wurden berücksichtigt.

## TESTS

`npm run test --prefix frontend` — Exitcode 0, 0 fehlgeschlagene Tests. Ergebniszeilen wörtlich:

```text
 Test Files  82 passed (82)
      Tests  859 passed (859)
   Start at  20:18:24
   Duration  36.45s (tests 52%, import 21%, transform 12%, worker 8%, environment 7%)
```

`npx tsc --noEmit -p frontend` — Exitcode 0. Keine Ausgabe; daher keine Ergebniszeile zu zitieren. Keine TypeScript-Fehler.

Zusätzlich: ESLint für die fünf geänderten TSX-Dateien einschließlich beider Tests — Exitcode 0, keine Diagnosen. `git diff --check` — Exitcode 0. Die npm-/npx-Befehle wurden unter Windows über `cmd /d /c` ausgeführt, weil PowerShell den npm.ps1-Wrapper nicht ausführen durfte.

Sieben neue Tests in `frontend/app/(marketing)/campspilot/marketing-a11y.test.tsx` prüfen echtes SSR-Markup mit `next/image`, Sprunglink/Main/H1, Überschriftenfolge, Alt-Attribute, Lazy Loading, Hero-Priorität/Sizes, reservierte Bildflächen, sichtbare SSR-Texte, Font-Konfiguration und beide Bewegungspfade. Die echte SiteMotion-Komponente läuft mit gemocktem `matchMedia` und beobachtbaren GSAP-/Lenis-Aufrufen. Der Wechsel zu reduzierter Bewegung prüft außerdem DOM-Wiederherstellung und Ressourcen-Cleanup.

## MUTATIONSPROBE

In `frontend/app/components/marketing/SiteMotion.tsx:23` wurde vorübergehend ausschließlich `if (preference.matches) return` entfernt. Ausgeführt:

```text
npm run test --prefix frontend -- marketing-a11y.test.tsx
```

Ergebniszeilen wörtlich:

```text
 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
```

Der Starttest scheiterte an `expect(gsap.registerPlugin).not.toHaveBeenCalled()` mit:

```text
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
```

Der Umschalttest scheiterte zusätzlich, weil das Setup erneut startete und Wort-Splits im DOM blieben. Probenprozess: Exitcode 1. Der Guard wurde im `finally` byte-identisch wiederhergestellt (`GUARD_RESTORED: true`). Anschließend bestand die vollständige Suite mit 859 Tests.

## BEFUNDE

Zeilen beziehen sich auf den finalen Arbeitsstand. Alle gefundenen Fehler im freigegebenen Umfang sind behoben; bestehende korrekte Eigenschaften sind ausdrücklich als geprüft gekennzeichnet.

| Datei:Zeile | Regel / Befund | Korrektur oder Prüfergebnis |
| --- | --- | --- |
| `frontend/app/(marketing)/campspilot/page.tsx:13`, `:34` | WCAG 2.4.1: Sprunglink und Main-Landmark fehlten. | Erster Link „Zum Inhalt springen“ verweist auf `main#inhalt` mit `tabIndex={-1}`. Haupt- und Fußnavigation sind benannt. |
| `frontend/app/components/marketing/SiteMotion.tsx:53` | WCAG 2.4.3: Bisher fingen Lenis-Ankerhandler Klicks ab, ohne den Fokus zum Ziel zu übertragen. | Anker bleiben vollständig nativ, einschließlich Sprunglink und Tastaturfokus. |
| `frontend/app/(marketing)/campspilot/marketing.css:109`, `:115`, `:116` | WCAG 2.4.7, 2.4.11 und 1.4.11: Spezifischere Formularregeln unterdrückten die Fokusumrandung; feste Navigation konnte Sprungziele verdecken. | Durchsetzbare 3-px-Fokusumrandung mit kontrastierendem Hintergrund, Scroll-Abstand und Sprunglink oberhalb des Startvorhangs. Kontrast dunkel: **16,36:1**, helle Sektionen: **16,25:1**, jeweils über 3:1. |
| `frontend/app/(marketing)/campspilot/marketing.css:101`, `:348`, `:563`, `:580`, `:632` | WCAG 1.4.1 / 1.4.11: Links waren pauschal ohne Unterstreichung; Ghost-Button und Eingabefelder hatten schwache Grenzen. | Textlinks unterstrichen; Marke und erkennbar geformte Buttons ausgenommen. Button- und Feldränder aufgehellt. Formularlogik unverändert. |
| `frontend/app/(marketing)/campspilot/marketing.css:19`, `:345` | WCAG 1.4.3: Kleine graue Texte auf `--night` nur **4,23:1**, weiße Buttontexte auf Orange nur **4,03:1**. | Grauton nun **7,90:1** auf `--night`; dunkler Buttontext **4,76:1** auf Orange. Neue Werte über CSS-Variablen. |
| `frontend/app/components/marketing/SiteMotion.tsx:23`, `:27` | Auftragsregel Reduced Motion: GSAP und ScrollTrigger wurden trotz Reduktion initialisiert; spätere Präferenzwechsel wurden ignoriert. | Zentraler Guard vor jedem Animationssetup. Präferenzänderungen werden beobachtet. Kein Lenis, GSAP-Kontext, ScrollTrigger, Split-Text oder Animationstimer bei anfänglicher Reduktion. |
| `frontend/app/components/marketing/SiteMotion.tsx:59`, `:178`, `:276`, `:297`, `:305` | Auftragsregel Reduced Motion / React-Effekt-Cleanup: Ticker und manuelle DOM-Änderungen wurden nicht vollständig zurückgesetzt. | Wort-Splits, Reveal-Attribute und Zahlenwerte werden wiederhergestellt; Media-Kontext, GSAP-Kontext, Ticker, Timer, Listener und Lenis werden aufgeräumt. |
| `frontend/app/(marketing)/campspilot/marketing.css:658`, `:671`; `frontend/app/components/marketing/SiteMotion.tsx:242` | Reduktion / WCAG 1.4.3: CSS verkürzte Übergänge lediglich; Zetteltexte wurden auf 30 % Deckkraft reduziert. | Animationen und Übergänge vollständig aus, natives Scrollen, Texte sofort mit voller Deckkraft. Auch die normale Zettelanimation blendet Text nicht mehr kontrastarm ab. |
| `frontend/app/(marketing)/campspilot/marketing.css:269`, `:403` | WCAG 2.2.2: Filmkorn und Scroll-Hinweis bewegten sich automatisch länger als fünf Sekunden ohne Stoppfunktion. | Endliche Wiederholungen: Filmkorn 4,4 Sekunden, Scroll-Hinweis 2,6 Sekunden. Bei Reduced Motion beide aus. Vom unabhängigen Reviewer nachgeprüft. |
| `frontend/app/(marketing)/campspilot/marketing.test.tsx:255` | Testqualität: Der bestehende Reduced-Motion-Test importierte nur die leere SiteMotion-Mock-Komponente. | `vi.importActual` prüft jetzt die echte Komponente. Neue Tests prüfen zusätzlich den vollständigen Setup-Verzicht; Mutationsprobe nachweislich rot. |
| `frontend/app/(marketing)/campspilot/page.tsx:109`, `:147` | GESCHMACK: Dasselbe Leibchenfoto erschien als Inhaltsbild und erneut als Bildstreifen. | Doppelten Streifen und zugehörigen Parallax-Aufruf entfernt; das Inhaltsbild bleibt erhalten. |
| `frontend/app/(marketing)/campspilot/page.tsx:54`, `:88`, `:105` | WCAG 1.3.1 / 2.4.6: Eine H1 und geordnete Überschriften. | Bereits korrekt; H1 → H2 → H3 ohne übersprungene Ebene durch SSR-Test abgesichert. |
| `frontend/app/(marketing)/campspilot/page.tsx:39`, `:74`, `:116`, `:167`, `:185`, `:290` | WCAG 1.1.1 und Ladeanforderung: Alt-Texte, Hero-Priorität und Lazy Loading. | Alle sechs Bilder besitzen beschreibende Alt-Texte. Hero bereits mit `priority`, `fetchPriority="high"`, `sizes="100vw"`; alle fünf nachfolgenden Bilder explizit lazy. Erhalten und getestet. |
| `frontend/app/(marketing)/campspilot/marketing.css:364`, `:412`, `:471`, `:501`, `:550`; `frontend/app/(marketing)/campspilot/page.tsx:164` | Ladeanforderung: Bilder dürfen ihre Fläche nicht erst nach dem Laden beanspruchen. | Bereits reservierte Containerhöhe bzw. `aspect-ratio: 4/5`; Netzfoto mit expliziter Breite/Höhe. Codeprüfung und Regressionstest. |
| `frontend/app/(marketing)/campspilot/layout.tsx:11` | Ladeanforderung Fonts. | `display: 'swap'` war vorhanden. Metrisch angepassten Next-Font-Fallback mit `adjustFontFallback: true` explizit abgesichert. |
| `frontend/app/(marketing)/campspilot/marketing.css:219`, `:426`; `frontend/app/(marketing)/campspilot/marketing-a11y.test.tsx:99` | Auftragsregel ohne JS: Text darf nicht initial unsichtbar bleiben. | SSR-Texte sichtbar; versteckende Listenklasse entsteht ausschließlich durch JS. Startvorhang verschwindet unabhängig von JS per endlicher CSS-Animation und ist bei Reduced Motion sofort ausgeblendet. Regressionstest prüft Markup. |

Kontrastwerte wurden aus den sRGB-Farbwerten berechnet. Sie belegen die genannten festen Farbpaarungen; eine Pixelmessung sämtlicher Fotohintergründe wurde nicht durchgeführt.

## ÄNDERUNGEN

- Produktionsdateien: ausschließlich `page.tsx`, `marketing.css`, `layout.tsx` im CampsPilot-Marketingverzeichnis sowie `SiteMotion.tsx`.
- Tests: `marketing-a11y.test.tsx` neu; vorhandenen `marketing.test.tsx` korrigiert.
- Übergabe: diese Datei. Keine Abhängigkeiten, Konfigurationsänderungen oder Änderungen an `PilotRequestForm.tsx`.
- Unabhängiges Read-only-Review gemäß `CLAUDE.md`: letzter Befund zu endlosen CSS-Animationen behoben und erneut bestätigt; keine weiteren offenen Befunde im geprüften Umfang.

## NICHT_AUSGEFÜHRT

- Keine Browser-/Screenreader-Prüfung, keine Screenshots bei 1440/390 px, kein Lighthouse und keine gemessene CLS-Auswertung. Abweichung vom allgemeinen Screenshot-Ablauf aus GESCHMACK: ausdrücklich beauftragte Accessibility-Prüfung durch Lesen des Codes. Bildflächen und Font-Fallback sind im Code abgesichert; ein gemessener CLS-Wert von null oder eine vollständige WCAG-Konformität wird nicht behauptet.
- Keine Produktionszugriffe, Deployments, Doppel-Club-Builds, Pushes oder PR-/Merge-Prüfungen. Beauftragt war die lokale Umsetzung; Commit und weitere Orchestrierung erfolgen danach.
- Kein `git add`, kein `git commit`.
- Kein Playwright ausgeführt oder hinzugefügt. Die bereits vorhandenen `frontend/playwright.config.cf1.ts` und `frontend/e2e/` wurden wegen der vorgegebenen Dateigrenzen unverändert gelassen.
- `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `backend_saas/**` und die Formularlogik wurden nicht verändert.
