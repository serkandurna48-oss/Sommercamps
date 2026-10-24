feat/cx32-bestaetigung
STATUS: fertig zur Prüfung

Stand: lokaler, uncommitteter Worktree auf Basis 93ac4479e1b9635409dac7cd8e80ba9e9e435df0.

TESTS

`npm run test --prefix frontend` — 0 fehlgeschlagen. Unter Windows über `npm.cmd` ausgeführt, da PowerShell `npm.ps1` sperrt. Ergebniszeilen unverändert aus `.qa-cx32/tests-final.log`:

```text
 Test Files  89 passed (89)
      Tests  943 passed (943)
Command exit code: 0
```

`npx tsc --noEmit -p frontend` — über `npx.cmd` ausgeführt, keine Compiler-Ausgabe und keine Fehler. Protokoll `.qa-cx32/tsc-final.log`:

```text
Command exit code: 0
```

Beide Abschlussprüfungen liefen nach der letzten Codeänderung.
Gezielte Tests: 30 bestanden in DoneScreen.test.tsx, DoneScreen.actions.test.tsx und siblingRegistration.test.tsx. React-DOM/SSR und bestehender Vitest-Stil, kein @testing-library/react.
Geprüft: Camp, Kind, Zeitraum, exakter E-Mail-Satz; tatsächlicher Fokus auf h1 mit role="status"; window.print(); weiteres Kind behält Eltern-E-Mail und leert Vor-/Nachnamen. Warteliste und fehlender Vereinskontakt sind berücksichtigt.
`git diff --check`: erfolgreich.
CSS-Klammern nach Bearbeitung: 681 öffnende, 681 schließende; `.qa-cx32/css-braces.log`.
Kontrast der Bestätigungsüberschrift/E-Mail anhand der vorhandenen Theme-Farbwerte: 4,54–19,76:1 für die geprüften Kombinationen, Drucktext 21:1. Berechnung: `.qa-cx32/contrast.log` und `check-contrast.cjs`.
Unabhängiger lokaler Diff-Review: keine blockierenden Befunde; `.qa-cx32/review.log`.

MUTATIONSPROBE

Die gesamte E-Mail-Zeile (`p.done-email`) in DoneScreen.tsx temporär entfernt. Ausgeführt:
`npm.cmd run test --prefix frontend -- DoneScreen.test.tsx -t 'CX32: bestätigt'`

Erwartet rot an der Assertion für „Wir haben eine Bestätigung an eva@example.de geschickt.“. Unveränderte Ergebniszeilen aus `.qa-cx32/mutation-red.log`:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
Mutation command exit code: 1
```

Originalquelle im finally-Block wiederhergestellt; der anschließende vollständige Testlauf ist grün. Das vollständige Mutationslog liegt als Datei vor, nicht nur als Konsolenausgabe.

VORHER/NACHHER

Vorher: RegistrationFormScreen.tsx ruft nach erfolgreicher API-Antwort onSubmitted mit Ergebnis, Kind-Vorname, Eltern-E-Mail und Elternkontaktdaten auf. ParentFlow wechselt zu DoneScreen. Dieser zeigte bereits Camp, Zeitraum, Kind-Vorname, Preis, Zahlungs-/Wartelistenhinweise und Vereinskontakt. Die reguläre Überschrift lautete bereits „Anmeldung eingegangen“, auf der Warteliste dagegen „[Kind] ist auf der Warteliste“. Fokus und role="status" waren bereits vorhanden. Der E-Mail-Hinweis stand weiter unten als „Wir schicken Ihnen eine Bestätigung an …“. Drucken fehlte. „Weiteres Kind anmelden“ mit Übernahme ausschließlich der Elternangaben funktionierte bereits.

Nachher: Einheitliche Überschrift „Anmeldung eingegangen“, unmittelbar darunter Camp-/Kind-Information und der verlangte Satz „Wir haben eine Bestätigung an [eingegebene E-Mail] geschickt.“. Die Warteliste bleibt ausdrücklich als solche erklärt; kein reservierter Platz und keine Zahlungsaufforderung für Wartende. Camp, Kind und Zeitraum bleiben in den Buchungsdetails sichtbar. In den öffentlichen Vereins-/Camp-Datentypen existiert kein konfigurierbarer Text für den nächsten Schritt; deshalb steht zusätzlich der beauftragte Fallback „Der Verein meldet sich bei Ihnen mit den weiteren Details.“. Vorhandene Zahlungs-/Camp-Hinweise bleiben erhalten. Kontakt erscheint nur bei vorhandenen Kontaktdaten, ohne leeren mailto-Link.

„Seite drucken“ ruft window.print() auf. Druckstyles am Ende von publicTheme.css verstecken Seitenkopf, Footer, Navigation, Buttons und Aktionslinks; der Bestätigungskopf bleibt bewusst druckbar. Text wird schwarz auf weiß ausgegeben, Animationseinflüsse werden entfernt. Lange E-Mail-Adressen umbrechen. Bestehende Theme-Variablen bestimmen Darstellung und Kontrast.

Der vorhandene Fokuswechsel und Geschwister-Reset werden weiterverwendet und durch echte DOM-Interaktionen geprüft. RegistrationFormScreen.tsx, ParentFlow.tsx, Formularfelder, Validierung und Submit-Logik sind unverändert. Keine verbotenen Pfade verändert, keine neuen Pakete und keine Playwright-Dateien angelegt.

NICHT_AUSGEFÜHRT

- Fullpage-Screenshots vorher/nachher bei 1440 und 390 sowie tatsächliche Browser-Druckvorschau: Browserzugang versucht; In-App-Browser nicht verfügbar, Browserinventar leer. Das ist die dokumentierte Abweichung von GESCHMACK.md. Statische Vorher-/Nachher-HTML-Dateien mit ausschließlich synthetischen Daten liegen unter `.qa-cx32/before.html` und `after.html`; sie ersetzen keine Browserprüfung.
- Tatsächlicher E-Mail-Versand/Zustellung nicht getestet. Der Wortlaut entspricht dem Auftrag; RegistrationCreated enthält keinen Versandstatus. Keine Backend-, Produktions- oder Mailaktionen ausgeführt.
- Kein Build, Deployment, Lint-Gesamtlauf oder KSV-/JK-Doppelbuild; Änderung ausschließlich im öffentlichen SaaS-Bestätigungsscreen, kein Commit/PR/Merge in diesem Auftrag.
- Kein npm install, git add, git commit, Push oder Merge. Orchestrator übernimmt den Commit.
