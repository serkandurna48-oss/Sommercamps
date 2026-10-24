feat/cx8-fehlerseiten

STATUS: fertig zur Prüfung

## TESTS

Geprüft wurde der uncommittete Arbeitsbaum auf Basis von `871570fb0c2742b0fdd0a9929a953964b92f7cdd`.

`npm run test --prefix frontend` — Exitcode 0, keine fehlgeschlagenen Tests. Ergebniszeilen wortgetreu:

```text
 Test Files  69 passed (69)
      Tests  693 passed (693)
   Start at  19:11:55
   Duration  43.42s (tests 50%, import 22%, environment 11%, transform 10%, worker 8%)
```

`npx tsc --noEmit -p frontend` — keine Compiler-Ausgabe, Exitcode 0.

ESLint für die zwölf geänderten/neuen TypeScript-Dateien: keine Ausgabe, Exitcode 0. `git diff --check`: Exitcode 0; lediglich Git-Hinweis auf spätere LF/CRLF-Konvertierung.

19 neue Zustandstests in `frontend/app/pilot/[org]/error-states.test.tsx`: unbekannter/unveröffentlichter Verein, verschwundenes Camp, Wartelistenübergang, beide Anmeldefenster einschließlich vollem geschlossenem Camp, leere Terminliste mit/ohne Kontakt, vergangene Termine, Ladefehler und Absenden mit Netzwerkfehler/404/409/422/429/500/503. Geprüft werden deutsche Texte, Aktionen, Vereinslogo und Fokus; bei allen Absende-Fehlern bleiben sämtliche Feldwerte einschließlich Auswahl, Freitext, Zusatzantwort und Einwilligungen erhalten. Netzwerk/5xx werden tatsächlich über den Wiederholungsbutton erneut abgesendet; der Payload bleibt gleich. Bestehende Tests prüfen zusätzlich die feldbezogene 422-Fokussierung und leere Filterergebnisse.

Synthetische Chromium-Sichtprüfung mit `node e2e/cx8-visual.cjs`: 144 fullPage-Aufnahmen, vorher/nachher, drei Themes, zwölf Zustände, 1440×900 und 390×844. Ergebniszeile wortgetreu:

```text
Screenshots: 144 (vorher/nachher, 3 Themes, 12 Zustände, 1440/390). Befunde: 0.
```

Kein horizontaler Überlauf; kleinster gemessener Textkontrast der erfassten Meldungen und Aktionen: **4,5564:1**. Vorher-Quellstand: HEAD; Nachher-Quellstand: Arbeitsbaum. Messdaten, HTML-Ansichten, PNGs und Testprotokolle liegen in [cx8-fehlerseiten](C:/Users/serka/dev/_reports/cx8-fehlerseiten). Beispiel: [geschlossene Anmeldung, mobil](C:/Users/serka/dev/_reports/cx8-fehlerseiten/after/akademie-closed-390.png).

Unabhängiges lokales Review durchgeführt. Gefundene CSS-Überschreibung der Fehlerseiten-Buttons korrigiert; Nachprüfung ohne weitere funktionale Findings. Zusätzlich erkannte die erweiterte Bildprüfung einen bestehenden Kontrastfehler bei goldenen Formular-/Wartelisten-Buttons auf hellem Theme; diese verwenden jetzt `--brand-on` passend zum berechneten Hintergrund.

## MUTATIONSPROBE

`not-found.tsx` vorübergehend durch `export default function OrgNotFound() { return null }` ersetzt. `npm run test --prefix frontend -- error-states` wurde erwartungsgemäß rot, Exitcode 1:

```text
 Test Files  1 failed (1)
      Tests  2 failed | 17 passed (19)
```

Beide Vereins-404-Tests scheiterten an der fehlenden Ausgabe „Vereinsseite nicht verfügbar“. Originaldatei im `finally`-Block bytegenau wiederhergestellt; anschließend vollständige Suite wieder grün. Protokoll: [mutation-cx8.log](C:/Users/serka/dev/_reports/cx8-fehlerseiten/mutation-cx8.log).

## ZUSTAENDE

| Zustand | Vorher | Nachher |
|---|---|---|
| Verein nicht gefunden | Eigene deutsche 404 mit festen Farben, ohne Aktion. | `not-found.tsx` im Vereinssegment: neutrale CampsPilot-Karte, Erklärung, Linkprüfung, „Erneut versuchen“, sichtbarer Fokus. |
| Verein nicht veröffentlicht | Derselbe 404 wurde als nicht vorhandene Organisation beschrieben. | Gemeinsame zutreffende Aussage: Unter dem Link ist kein veröffentlichter Verein erreichbar. Gleiche klare Aktion. |
| Camp nicht gefunden/entfernt | Verschwindet das ausgewählte Camp, fällt die Ansicht kommentarlos auf die Übersicht zurück; beim Absenden nur generischer 404-Text. | Vereinslogo und Meldung „Camp nicht gefunden“ mit „Alle Camps ansehen“; auch Submit-404 erhält diesen Rückweg. |
| Camp voll → Warteliste | Wartelistenseite vorhanden; blaue Statusmarkierung und unbelegte persönliche Benachrichtigungszusage. | Vereinslogo, Markierung im Theme, ruhiger Hinweis und funktionierender Button „Auf die Warteliste setzen“; unbelegte Zusage entfernt. |
| Anmeldung noch nicht offen | Pauschal „Anmeldung geschlossen“, deaktivierter Anmeldebutton. | Eigene Erklärung anhand des vorhandenen Startzeitpunkts, Überschriftenfokus, „Alle Camps ansehen“. |
| Anmeldefenster geschlossen | Geschlossen-Chip und deaktivierter Button; bei vollem Camp auch deaktivierter Wartelistenbutton. | Eigene Meldung mit Rückweg zur Camp-Übersicht, auch beim vollen Camp. |
| Netzwerkfehler beim Absenden | Generischer Verbindungstext, Daten bereits erhalten, Fokus per Animationsframe. | Hinweis auf unklaren Anmeldestatus, Verbindung prüfen, „Erneut versuchen“; Meldung oberhalb des Buttons, Fokus nach Rendern und vollständiger Datenerhalt. |
| Submit 409 | Bereits vorhandene Anmeldung genannt, unveränderter Absende-CTA. | Erklärung plus „Kontakt aufnehmen“ mit Vereins-`mailto:`; ohne Kontaktadresse „Alle Camps ansehen“. |
| Submit 422 | API-Übersetzung bzw. Feldfehler; allgemeiner Text ohne klaren Hinweis auf Angaben und Frist. | Deutscher Hinweis auf Angaben und Anmeldefrist; vorhandene Feldzuordnung/Fokussierung bleibt, Wiederholung möglich, Daten bleiben erhalten. |
| Submit 429 | Generischer Speicherfehler. | Zu viele Versuche erklärt, Bitte um kurze Wartezeit, „Erneut versuchen“. |
| Submit 5xx | Generischer Speicherfehler, bisheriger Absende-CTA. | Unklaren Anmeldestatus benennen, später erneut versuchen; Fokus am Fehler, „Erneut versuchen“, sämtliche Eingaben bleiben erhalten. |
| Keine Camps veröffentlicht | Einzelner Satz ohne Aktion. | Meldung im Vereinsschema mit Logo; Kontaktlink, falls vorhanden, sonst erneuter Aufruf. |
| Nur vergangene Camps | Unbelegte Zusage „Neue Termine folgen in Kürze“. | Sachlicher Hinweis auf fehlende weitere veröffentlichte Termine, Kontakt-/Wiederholungsaktion. |
| Kein Filtertreffer | Hinweis und Filter-zurücksetzen-Button vorhanden. | Ergänzte Handlungsanweisung; bestehender funktionierender Button „Alle Camps zeigen“ bleibt. |
| Fehler beim Laden von Verein/Camps | Fetch-Fehler wurde weitergeworfen. | Deutsche Wiederholungsseite; bekanntes Vereinsdesign bleibt erhalten, ohne geladene Vereinsdaten neutraler Plattformauftritt. |

## ÄNDERUNGEN

- Gemeinsame Meldungskomponente `PublicState`, Wiederholungsbutton, Ladefehleransicht und Hinweis auf gesperrte Anmeldefenster ergänzt. Typografie und Farben stammen aus dem vorhandenen öffentlichen Theme; neue Layoutwerte sind CSS-Variablen.
- Formularfehler erhalten kontrollierte deutsche Texte statt ungeprüfter Upstream-Texte, Vereinslogo, Fokus und passende Aktion. Die Formularinstanz und ihre Werte bleiben bei Netzwerk-/Serverfehlern bestehen.
- Leere Zustände, verschwundene Camps und Ladefehler an die neuen Komponenten angeschlossen. Die unbelegte Zusage einer Antwort am selben Tag entfernt.
- Die API unterscheidet unbekannte und unveröffentlichte Vereine absichtlich nicht: Beide liefern `null` nach 404. Ohne geladene Vereinsdaten werden weder Logo, Vereinsfarbe noch Kontaktadresse erfunden. Daher hier ein neutraler gemeinsamer 404-Auftritt.
- Die bestehende öffentliche Camp-Auswahl läuft innerhalb von `ParentFlow`, nicht über einzelne öffentliche Camp-URLs. „Camp nicht gefunden“ deckt eine entfernte Auswahl sowie Submit-404 ab; keine neue URL-Struktur eingeführt.
- Keine neuen Dependencies, keine Änderungen an den gesperrten Dateien oder an `backend_saas/**`. Playwright-Hilfscode ausschließlich unter `e2e/` im Repository-Root. Keine Änderungen an `DESIGN.md`.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit.
- Keine produktiven Daten, echte Anmeldungen, Nachrichten oder Backend-Schreibzugriffe verwendet.
- Kein vollständiger Next.js-Build und kein Test gegen einen laufenden Next.js-/API-Server. Unit-/DOM-Tests verwenden API-Mocks.
- Abweichung von der vollständigen Design-Abnahme: Die Screenshots sind synthetische SSR-Zustandsansichten mit originalem öffentlichem CSS und Testdaten. Sie verwenden System-Ersatzschriften und enthalten nicht das gesamte Next.js-Root-Layout bzw. dessen Tailwind-Utility-Ausgabe; insbesondere die alte 404-Ansicht ist deshalb kein pixelgenauer Produktionsvergleich. Keine Prüfung der tatsächlichen Webfont-Ladung oder Hydration. Die Interaktionen und Fokuswechsel sind separat durch die DOM-Tests geprüft.
- Kontrastmessung gezielt für Fehler-/Leertexte, deren Überschriften und Aktionen, Wartelistenhinweise und Formular-CTA; keine vollständige Barrierefreiheitsprüfung aller übrigen Seitenelemente.
