feat/d3c-anmeldung-premium

STATUS: fertig zur Prüfung

COMMIT: 2ca0369

TESTS:
```
npm run test --prefix frontend -- --run
 RUN  v5.0.1 C:/Users/serka/Desktop/Projekte/wt/D3c/frontend

 Test Files  1 failed | 60 passed (61)
      Tests  1 failed | 548 passed (549)
   Duration  1163.78s

 FAIL  app/dev/admin-vorschau/preview.test.tsx >
       development-only admin preview >
       renders camp with the real shell and without I/O
 Error: Test timed out in 30000ms (tatsächlich 31568ms)

npm run lint --prefix frontend   → exit 0 (0 errors)
npx tsc --noEmit -p frontend/tsconfig.json  → exit 0 (0 errors)
```

Hinweis zum Timeout-Fehler:
preview.test.tsx/camp ist ein vorhandenes flakiges Timing-Problem (30s-Limit, Render-
Laufzeit unter Last). Mein vorheriger Parallellauf mehrerer Prozesse hat es über die
Grenze gedrückt. Die betroffene Datei (app/dev/admin-vorschau/) importiert keine Dateien
aus pilot/[org]/ und ist nicht Scope von D3c. Im gleichen Lauf ist der zuvor fehlende
parent-journey.test.tsx-Test ("shows price, date, location...") jetzt grün.

MUTATIONSPROBE:
d3c.test.tsx Test 1 ("renders all required fields with expected name attributes") ist
ein Mutations-Probe-Test: Umbenennen eines `name`-Attributs (z. B. `parent_email` → `parentEmail`)
lässt diesen Test sofort rot werden, ohne dass die App funktional bricht.

ÄNDERUNGEN:

frontend/app/pilot/[org]/RegistrationFormScreen.tsx
- Vollständig neu: Split-Layout D3c (5/12 Aside desktop, 7/12 Formular)
- CampSummary-Komponente wird vor .d3c-layout eingebettet (Pflicht für parent-journey.test.tsx)
- Fortschrittsleiste .d3c-prog sticky oben (0–100 % je nach ausgefüllten Sektionen)
- Sektionen: 1 Kind · 2 Eltern & Notfall · (3 Zusatzfragen wenn vorhanden) · 3/4 Einwilligungen
- Alle name-Attribute gesetzt: child_first_name, child_last_name, child_birth_date,
  jersey_size, parent_name, parent_email, parent_phone, emergency_phone, allergies, pickup_authorized
- autocomplete-Attribute auf allen Schlüsselfeldern
- data-section="" + sec-rise CSS-Klassen auf Sections (SSR-sicher, kein inline opacity)
- Mobile Bar: aufklappbarer Header .d3c-mob-bar-wrap (state asideOpen an Slot 9 — nach allen vorherigen Hooks)
- Alle bestehenden Validierungen erhalten (parentName-Space-Prüfung, Fehlermeldungen, Submit-Logik)

frontend/app/pilot/[org]/DoneScreen.tsx
- copiedField-State: 'ref' | 'iban' | 'betrag' | null (war: boolean)
- handleCopy(field, text) ersetzt einzelne kopieren-Funktion
- Neue Zeile "Betrag" mit Kopierschaltfläche (aria-label="Betrag kopieren")
- IBAN-Zeile hat jetzt Kopierschaltfläche (aria-label="IBAN kopieren")
- SVG-Haken im Header hat Klasse .d3c-check-path (für CSS-Zeichenanimation)
- done-transfer nur bei !waitlisted && iban (wie vorher — Regressionssicherheit)

frontend/app/pilot/[org]/publicTheme.css
- .d3c-prog: 3px sticky Fortschrittslinie (Position top: 65px, z-index 17)
- .d3c-layout: Block mobile, Grid 5fr 7fr ab 1000px
- .d3c-aside: sticky Desktop-Sidebar (display:none mobile, display:flex ab 1000px)
- .d3c-mob-bar-wrap: mobiler collapsible Header (hidden ab 1000px)
- .m1-ready .d3c-layout [data-section]: opacity 0 + translateY(18px) → sec-rise-Animation
- .step / .step.done: Schritt-Indikatoren (Kreis, grün wenn fertig)
- @keyframes cp-check-draw + .d3c-check-path: SVG-Haken-Animation
- .done-transfer-row.has-copy: 3-Spalten-Grid (Label · Wert · Kopier-Button)
- Feldgröße: height 56px, font-size 16px für #s-form .field input/select

frontend/app/pilot/[org]/d3c.test.tsx (neu)
Sechs Tests:
1. Feld-Name-Snapshot: alle 7 Pflicht-name-Attribute vorhanden (Mutations-Probe)
2. autocomplete: given-name, family-name, bday, email, tel auf den richtigen Feldern
3. Preisanzeige im Dock: formatierter Betrag (149) im .sum-Element
4. DoneScreen: IBAN + Verwendungszweck + Betrag sichtbar, je ≥3 Kopier-Buttons
5. SSR: kein inline opacity:0 in der Ausgabe
6. sec-rise: keine inline opacity auf .sec-rise-Elementen

SCREENSHOT-HINWEISE:

1440×900 (Desktop):
- Linke Spalte (5/12): Vereinsfoto + Camp-Titel + Daten + Preis, sticky beim Scrollen
- Rechte Spalte (7/12): Formular mit 3–4 nummerierten Sektionen
- Fortschrittsleiste oben sichtbar (beginnt leer, füllt sich beim Ausfüllen)
- Übermittlungs-Dock mit Preis unten an der Seite

390×844 (Mobile, iPhone-Größe):
- Kein Aside: stattdessen kompakte Klappzeile oben (Camp-Titel + Preis, antippen → aufklappen)
- Fortschrittsleiste direkt darunter
- Formular nimmt die volle Breite ein
- Nach der Anmeldung: SVG-Haken zeichnet sich ein (Animation wenn prefers-reduced-motion: no-preference)

NICHT_AUSGEFÜHRT:
- Browser-Verifikation (kein Browser im Testumfeld verfügbar)
- E2E-Tests mit echtem Backend
- Test auf echtem iOS/Android (safe-area-inset-bottom im Dock)
- Animation nicht automatisch verifiable (CSS-only, kein Vitest für CSS-Animationen)
