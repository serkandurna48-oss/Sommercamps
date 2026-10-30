feat/cx3-barrierefrei
STATUS: fertig zur Prüfung

## TESTS

Abschlussprüfung am 24.10.2026 im aktuellen Worktree, Basis-HEAD `9c80618`. Änderungen sind uncommittet.

`npm run test --prefix frontend` — unter Windows über `npm.cmd` ausgeführt. Ergebniszeilen unverändert:

```text
 Test Files  69 passed (69)
      Tests  682 passed (682)
   Start at  18:38:27
   Duration  91.16s (tests 41%, import 28%, worker 12%, transform 10%, environment 9%)
```

Exit-Code: 0; 0 fehlgeschlagene Tests.

`npx tsc --noEmit -p frontend` — über `npx.cmd`, mit `frontend/node_modules/.bin` im PATH. Der Compiler gab keinen Text aus. Ergebniszeile des ausführenden Skripts unverändert:

```text
TSC_EXIT_CODE=0
```

Zusätzlich: ESLint für alle sechs geänderten TypeScript-/TSX-Dateien einschließlich der neuen Testdatei: keine Fehler, keine Warnungen, `LINT_EXIT_CODE=0`. `git diff --check`: Exit 0.

Neue Tests: `frontend/app/pilot/[org]/cx3-a11y.test.tsx`, acht Prüfungen mit Vitest, React-DOM und jsdom:

- Explizite sichtbare Label-Bindungen für sämtliche Formularfelder, Zusatzfragen einschließlich „Andere Position“ und CF1-Ortsfilter.
- Pflichtstatus, verknüpfte Fehlermeldungen, Fehlerankündigung, Fokusreihenfolge und blockierte Übermittlung bei fehlenden Zusatzantworten.
- Fokus und Fehlerbeschreibung bei serverseitigen Feldfehlern.
- Reduced-Motion-Media-Query und begrenzte automatische Animationen.
- Informative Alternativtexte sowie leere Alternativtexte dekorativer Bilder, in allen drei Themes.
- Versteckte CTA ist `inert`; Camp-Sprung setzt den Fokus; native Buttons und Links.
- Fokusring-Regeln, Kontrastberechnung und Mindestgrößen der Ziele.
- Genau eine h1 und geordnete Überschriftenhierarchie je geprüfter Ansicht.

Unabhängiger Read-only-Review gemäß CLAUDE.md durchgeführt; abschließend keine weiteren Befunde. Die React-Prüfung erfolgte zusätzlich anhand des Skills `vercel:react-best-practices`.

Testprotokolle liegen lokal unter `frontend/.next/cx3-tests.log`, `cx3-tsc.log`, `cx3-lint.log` und `cx3-mutation.log`. Keine neuen Dependencies: vorhandene Pakete wurden aus dem benachbarten CX2-Worktree mit identischem SHA-256 des package-lock.json lokal kopiert, nachdem der Paketdownload nicht verfügbar war. Paketdateien blieben unverändert.

## MUTATIONSPROBE

In `RegistrationFormScreen.tsx` wurde ausschließlich `htmlFor="child_first_name"` vorübergehend entfernt. Ausgeführt:

```text
npm run test --prefix frontend -- cx3-a11y.test.tsx -t bindet
```

Erwartet rotes Ergebnis, unveränderte Ergebniszeilen:

```text
AssertionError: Explizites Label fehlt: child_first_name: expected undefined to be defined
 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
MUTATION_EXIT_CODE=1
```

Die Quelldatei wurde in einem `finally`-Block bytegetreu wiederhergestellt. Die oben dokumentierte vollständige grüne Suite wurde danach auf dem finalen Stand ausgeführt.

## BEFUNDE

Code-Audit der angeforderten Kategorien anhand von [WCAG 2.2](https://www.w3.org/TR/WCAG22/), ergänzt um die ausdrücklich verlangten strengeren Umsetzungsvorgaben. Zeilen beziehen sich auf den finalen Stand. Alle unten genannten Quelldateien liegen unter `frontend/app/pilot/[org]/`.

| Datei:Zeile | Regel / Befund | Behebung |
| --- | --- | --- |
| `RegistrationFormScreen.tsx:353` | 1.3.1, 3.3.2; nur implizite Label-Bindung, explizites htmlFor/id laut Auftrag fehlte. | Alle 13 Basisfelder einschließlich optionaler Angaben und Einwilligungen explizit gebunden. Implizite Labels waren bereits grundsätzlich zulässig; dies erfüllt die strengere Auftragsvorgabe. |
| `ExtraQuestions.tsx:61`, `ExtraQuestions.tsx:148` | 1.3.1, 3.3.2; Zusatzfragen nur implizit gebunden, Sonstiges-Freitext ohne dauerhaft sichtbares Label. | Eindeutige IDs und htmlFor für Text, jede Radiooption und Sonstiges; sichtbares Freitextlabel ergänzt. |
| `CampFilter.tsx:36` | 3.3.2 / Auftragsvorgabe sichtbares Label; Ortslabel war ausschließlich für Screenreader sichtbar. | Vorhandenes Label „Ort“ sichtbar gemacht, Bindung beibehalten. |
| `RegistrationFormScreen.tsx:360`, `ExtraQuestions.tsx:67`, `ExtraQuestions.tsx:88` | 4.1.2 / Auftragsvorgabe aria-required; Pflichtstatus der Zusatzfragen unvollständig. | Native required-Attribute und aria-required ergänzt. Bei Radiofragen liegt aria-required regelkonform an der radiogroup; einzelne Radios tragen required. |
| `ExtraQuestions.tsx:76`, `ExtraQuestions.tsx:88`, `ExtraQuestions.tsx:170` | 3.3.1, 4.1.2, 4.1.3; Radio-/Sonstigesfehler nicht mit Bedienelementen verknüpft, Zusatzfehler nicht angekündigt. | Fehler-IDs per aria-describedby verknüpft, aria-invalid am Feld bzw. der Radiogruppe, role=alert für Zusatzfehler. |
| `RegistrationFormScreen.tsx:92`, `RegistrationFormScreen.tsx:168`, `RegistrationFormScreen.tsx:230` | 2.4.3, 3.3.1; fehlende Zusatzantworten verhinderten Absenden nicht und wurden in Fehlerzahl/Fokus nicht berücksichtigt. | Zusatzpflichtfragen blockieren den Request und zählen zur Zusammenfassung. Nach dem Rendern erhält das erste ungültige Feld in DOM-Reihenfolge Fokus, bei Gruppen das ausgewählte bzw. erste Radio. Gilt auch bei wiederholtem Absenden und Serverfehlern. |
| `ParentFlow.tsx:574`, `ParentFlow.tsx:422` | 2.1.1, 2.4.3; versteckte Sticky-CTA noch fokussierbar, Camp-Sprung versetzte nur den sichtbaren Ausschnitt. | Versteckte CTA mit inert aus Interaktion und Tastaturfolge entfernt. Camp-Ziel erhält programmatisch Fokus ohne zusätzlichen Tabstopp. |
| `publicTheme.css:3434`, `publicTheme.css:3452` | 2.4.7, 1.4.11; Feldregeln entfernten den Outline, Markenfarbe garantierte keinen Fokuskontrast; Scrollcontainer konnten Ringe abschneiden. | Ausreichend spezifischer zweifarbiger Fokusring; Schwarz/Weiß rechnerisch 21:1. Beide Farben sichern auch auf variierenden einfarbigen Hintergründen mindestens eine stark kontrastierende Kontur. Innenabstand für Ringe in CF1-Scrollcontainern. |
| `publicTheme.css:3439`, `publicTheme.css:3443` | 2.5.8 / strenge Größenanforderung; Checkboxfläche nur 20 px, keine durchgängige Mindestgröße für alle Buttons/Radioflächen. | Mindestens 24 × 24 px für Buttons, Summary und Radio-/Checkboxflächen. Bereits größere klickbare Labels und 44-px-Links bleiben erhalten; Inline-Rechtslinks nutzen die zulässige Textausnahme. |
| `ParentFlow.tsx:491`, `ParentFlow.tsx:509`, `clubAssets.ts:19` | 1.1.1; informative Galeriebilder mit leerem alt, Trainerbild ohne Kontaktnamen ebenfalls leer. | Nach Sichtung der drei lokalen Fotos passende Alternativtexte zentral bei den Vereinsassets ergänzt. Trainer-Fallback aus Vereinsnamen. Dekorative Hero-/Formularbilder behalten alt="". |
| `RegistrationFormScreen.tsx:100`, `ParentFlow.tsx:131`, `publicTheme.css:1554` | Auftragsvorgabe prefers-reduced-motion; zusätzlich 2.3.3 (AAA), kein AA-Kriterium: erzwungenes sanftes Scrollen trotz Bewegungspräferenz. | Scrollen bei reduce sofort; CSS-Animationen abgeschaltet, Übergänge minimiert und Scrollverhalten zurückgesetzt. Bestehende GSAP-Prüfung bleibt erhalten. |
| `publicTheme.css:203`, `publicTheme.css:1809`, `publicTheme.css:2647` | 2.2.2; automatisch laufendes Filmkorn/Laufband sowie 14-sekündige Heroanimation ohne allgemeine Stoppsteuerung. | Automatische Bewegung zeitlich begrenzt: Filmkorn 4,4 s, Hero 4 s, Laufband 5 s bei unveränderter Laufgeschwindigkeit. Neue Werte sind CSS-Variablen. |

Ohne Änderungsbedarf geprüft: eine h1 pro Ansicht, folgende h2/h3 in geordneter Hierarchie; native Buttons, Links und FAQ-Summary; Alt-Texte der Vereinslogos; bereits vorhandene globale Fehlerankündigung, Formularüberschrift-Fokus sowie CF1-Ergebnis-Live-Region. Elterntexte bleiben deutsch in Sie-Ansprache.

## ÄNDERUNGEN

- Kleine Korrekturen an `ParentFlow.tsx`, `RegistrationFormScreen.tsx`, `ExtraQuestions.tsx`, `CampFilter.tsx`, `clubAssets.ts` und `publicTheme.css`.
- Neu: `cx3-a11y.test.tsx` und diese Übergabe.
- Kein visuelles Redesign. Vereinsfarben, Inhalte und Layoutstruktur bleiben erhalten; sichtbar ergänzt wurden erforderliche Labels, Fokusmarkierungen und minimale Bedienflächen.
- `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts` und `backend_saas/**` wurden nicht verändert.

## NICHT_AUSGEFÜHRT

- Kein git add, git commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit.
- Keine produktiven API-/Datenbankaufrufe, keine echten Anmeldungen oder Nachrichten.
- Keine Browser-/Screenreader-Abnahme und keine 1440-/390-px-Screenshots: dieser Auftrag wurde als Code-Audit mit DOM- und CSS-Prüfungen umgesetzt, nicht als Designiteration. Reale Darstellung, vollständige Textkontraste und Screenreader-Ausgabe sind damit nicht visuell bzw. akustisch abgenommen.
- Keine Produktionsbuilds für KSV/JK; es wurden ausschließlich der Pilotbereich geändert und die geforderten Frontendtests und TypeScript-Prüfung sowie gezieltes Lint ausgeführt.
