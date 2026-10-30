feat/cx6-kalender

STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend` — Exit 0, keine fehlgeschlagenen Tests. Ergebniszeilen unverändert:

```text
 Test Files  70 passed (70)
      Tests  690 passed (690)
```

`npx tsc --noEmit -p frontend` — keine Ausgabe, keine Fehler, Exit 0. Ergebniszeile des aufrufenden Prüfskripts unverändert:

```text
TSC_EXIT_CODE=0
```

Die Befehle liefen unter Windows über `cmd /d /c`, da PowerShell den npm.ps1-Wrapper sperrt. Für TypeScript wurde der lokale Binärpfad ergänzt.

- 16 neue Tests: Kalenderformat, Text-Escaping, 75-Oktett-Faltung einschließlich Umlauten/Emoji, CRLF, Monats-/Jahreswechsel, Schaltjahr, stabile UIDs, mehrere Zeiträume, Ausschluss von Personen-/Zahlungsdaten; Komponentenaktionen in allen drei Themes, exakter WhatsApp-Link, Blob-Download und Freigabe der Objekt-URL, Wartelistenabgrenzung.
- `git diff --check`: Exit 0.
- Unabhängiges Code-Review: keine offenen Befunde nach Korrektur der UID-Stabilität bei Datumsänderungen.
- FullPage-Screenshots vorher/nachher in allen drei Themes bei 1440 und 390 px Breite: `C:\Users\serka\dev\_reports\CX6\`. Chromium rendert die tatsächliche Komponente und das vorhandene Theme-CSS mit neutralen Testdaten. Die isolierte Darstellung verwendet lokale Ersatzschriften und deaktivierte Motion; sie ist kein vollständiger Next.js-Lauf.
- Beide neuen Aktionen: gemessene Höhe 52 px, kein horizontaler Überlauf. Textkontrast: Tradition 17,78:1, Akademie 15,27:1, Kompakt 19,44:1. Messdaten: `sichtpruefung.json` im selben Berichtsordner.
- Vollständige Protokolle: `tests.log`, `tsc.log`, `mutation.log` im Berichtsordner.

## MUTATIONSPROBE

In `frontend/app/lib/ics.ts` vorübergehend `end.getUTCDate() + 1` durch `end.getUTCDate()` ersetzt und die Kalender-Tests ausgeführt. Ergebniszeilen unverändert:

```text
 Test Files  1 failed (1)
      Tests  6 failed | 5 passed (11)
MUTATION_EXIT_CODE=1
```

Beispiel Jahreswechsel: erwartet `DTEND;VALUE=DATE:20280101`, erhalten `DTEND;VALUE=DATE:20271231`. Mutation anschließend im `finally`-Block zurückgenommen. Der oben dokumentierte grüne Gesamtlauf erfolgte danach.

## ÄNDERUNGEN

- `frontend/app/lib/ics.ts`: reine Funktion `buildCampIcs` mit explizitem Zeitstempel-Argument. VCALENDAR 2.0, PRODID `-//CampsPilot//DE`, je Zeitraum ein Ganztagstermin mit exklusivem Enddatum, Titel/Vereinsname, optional Ort und Betreuungszeiten. UTF-8-Faltung und Text-Escaping gemäß [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). Ausschließlich CRLF-Zeilenenden.
- `frontend/app/pilot/[org]/DoneScreen.tsx`: „In den Kalender eintragen“ lädt `CAMPSLUG.ics` lokal herunter. „Per WhatsApp teilen“ öffnet den vorgegebenen deutschen Text mit öffentlicher Vereinsadresse, URL-kodiert und mit `noopener noreferrer`. Beide Aktionen stehen unter dem Bestätigungsinhalt und verwenden unverändert `btn btn-pill` und die bestehenden Theme-Variablen. Auf der Warteliste werden sie ausgeblendet, weil dort noch kein Platz reserviert ist.
- `frontend/app/lib/ics.test.ts` und `frontend/app/pilot/[org]/DoneScreen.actions.test.tsx`: Unit- und Komponententests.
- Datenmodellbedingte Anpassung: `CampPublic` enthält keine interne Camp-ID. Die UID verwendet daher die öffentliche Campidentität aus Vereins-/Camp-Slug plus Anmeldungstoken und Zeitraumindex. Sie bleibt bei erneutem Download, verändertem Zeitstempel und geänderten Termindaten gleich. Keine Backend- oder API-Änderung.
- Kalender und WhatsApp enthalten keine Kindes-/Elternnamen, E-Mail-Adressen oder Zahlungsreferenzen. Der Anmeldungstoken wird ausschließlich für die Kalender-UID verwendet. Der geteilte Link enthält keine Filter, Fragmente oder Anmeldungstoken.
- Vorgaben aus GESCHMACK eingehalten: bestehendes Design und Vereinsdaten, keine neuen Farb-/Abstandswerte, deutsche Texte, neutrale Testdaten. Keine neue Dependency.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Geprüft wurde der lokale Arbeitsstand auf Basis von `871570fb0c2742b0fdd0a9929a953964b92f7cdd`; der Orchestrator übernimmt den Commit.
- Kein Produktionszugriff, keine echte Anmeldung, kein WhatsApp-Versand und kein Import in externe Kalenderprogramme.
- Keine vollständigen KSV-/JK-Produktionsbuilds oder Browser-End-to-End-Anmeldung gegen ein Backend. Komponententest prüft Download und Link lokal; Screenshots prüfen das isolierte Layout mit Ersatzschriften.
- ESLint konnte nicht ausgeführt werden: Das in package.json deklarierte Paket ist in den verfügbaren node_modules nicht vorhanden (`MODULE_NOT_FOUND`). Es wurde keine Dependency installiert.
- Die lokale Next.js-Dokumentation unter `node_modules/next/dist/docs/` fehlt; die [offizielle Dokumentation zu Client Components](https://nextjs.org/docs/app/api-reference/directives/use-client) wurde als Ersatz gelesen.
- Unverändert: `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` und `backend_saas/**`. Keine Playwright-Datei unter `frontend/`; der Screenshot-Prüfer liegt ausschließlich im externen Berichtsordner.
