feat/d3g-formular-feinschliff

STATUS: fertig zur Prüfung

COMMIT: d77230d0a5f81ce0192c7823a714953bc1e1d3a1

TESTS:
npm run test --prefix frontend → Test Files  61 passed (61) · Tests  556 passed (556) · 0 failed
npm run lint --prefix frontend → 0 errors (exit code 0)
npx tsc --noEmit -p frontend  → 0 errors (exit code 0)

MUTATIONSPROBE:
d3c.test.tsx:180 – „step heads have no centered alignment": Würde man `style={{ textAlign: 'center' }}`
an ein `.fsec-head`-Element anhängen, scheitert dieser Test (expect(style?.textAlign).not.toBe('center')).

ÄNDERUNGEN:
frontend/app/pilot/[org]/publicTheme.css
  - Zeile 2419: tradition-spezifischer `.fsec-head`-Override von `align-items: center; text-align: center`
    auf `align-items: flex-start` geändert → Schritt-Köpfe jetzt linksbündig statt zentriert.
  - Dateiende: Neue Regeln `.consent b .consent-req` (Pflichtfeld-Hinweis 13 px/muted inline)
    und `.consent .txt a, .note a` (Links ohne touch-44 px-Aufblähen) ergänzt.

frontend/app/pilot/[org]/RegistrationFormScreen.tsx
  - Teilnahmebedingungen-Karte: `<span>Pflichtfeld *</span>` als Geschwister-Element entfernt;
    Text als `<span className="consent-req"> Pflichtfeld *</span>` in das `<b>`-Element verschoben.
  - Datenschutz-Karte: identische Änderung.

frontend/app/pilot/[org]/d3c.test.tsx
  - 3 neue D3g-Tests ergänzt (Zeilen 180–237):
    1. step heads have no centered alignment (Mutations-Sonde)
    2. all three consent cards contain a span.txt
    3. "Pflichtfeld" text is inside the title <b> element, not a sibling span

frontend/app/pilot/[org]/RegistrationFormScreen.test.tsx
  - Hilfsfunktion `checkbox()` (Zeile 59–68) angepasst: prüft jetzt auch Array-children auf
    `<b>`-Elementen (`c[0] === heading`), da das `<b>` nach der TSX-Änderung kein reiner String
    mehr ist → behebt 6 zuvor fehlgeschlagene Tests.

NICHT_AUSGEFÜHRT:
- npm run build (kein npm install/build erlaubt laut Befehlsregeln)
- Manuelle Browser-Sichtprüfung (kein Browser-Zugang im Agenten-Kontext)
- Push auf Remote / PR-Öffnung (kein Deploy-Branch-Zugang ohne Bestätigung)
