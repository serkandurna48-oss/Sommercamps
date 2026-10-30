# UEBERGABE-D3f — D3d Formular-Schliff

Branch: feat/d3f-anmeldung-schliff
STATUS: fertig zur Prüfung
COMMIT: de7bf6037f5f10843427ec89b826a3599a36aad0

---

## TESTS

```
npm run test --prefix frontend
→ Test Files  61 passed (61)
→ Tests       553 passed (553)   0 failed

npm run lint --prefix frontend
→ 0 errors

npx tsc --noEmit -p frontend
→ exit 0, keine Fehler
```

---

## MUTATIONSPROBE

Test `d3c.test.tsx: submit button text is exactly "Verbindlich anmelden · 149,00 €" for 149€ camp`:

- Wenn im Knopftext der Preis entfernt wird (nur `'Verbindlich anmelden'` statt Template-Literal mit `formatPrice`), schlägt dieser Test mit `expected 'Verbindlich anmelden' to equal 'Verbindlich anmelden · 149,00 €'` fehl. ✓

---

## ÄNDERUNGEN

### frontend/app/pilot/[org]/RegistrationFormScreen.tsx
- Import `CampSummary` entfernt
- `<CampSummary camp={camp} />` aus dem Formular-Screen entfernt (Mangel 1)
- `totalSteps` (3 ohne Extra-Fragen, 4 mit) berechnet
- Jede `fsec-head`-Sektion: Ziffernkreis (`<span class="step">`) durch `<span class="fsec-step-lbl">SCHRITT N VON N</span>` ersetzt (Mangel 2)
- Absende-Knopf: `'Anmeldung absenden'` → `` `Verbindlich anmelden · ${formatPrice(...)}` `` (Mangel 3)
- Plätze-Info zur Desktop-Aside hinzugefügt (mit `accent`-Klasse wenn ≤ 10)
- Plätze-Info zur mobilen Bar-Body hinzugefügt (nur wenn ≤ 10)

### frontend/app/pilot/[org]/publicTheme.css
- `.consent .txt span` font-size: 13px → 15px (Mangel 4)
- `#s-form .consent input[type='checkbox']` width/height: 44px → 24px (Mangel 4)
- D3c-Abschnitt: Ziffernkreis-CSS (`.step`, `.step.done`, `.fsec-head`-Override) durch `.fsec-step-lbl` ersetzt (Mangel 2)
- `#s-form .fsec-head .d3` auf 24px/600 gesetzt
- Desktop (≥ 1000px): `#s-form .d3c-main .dock` auf `position: sticky; bottom: 0` (Mangel 5)
- `#s-form .top` und `.d3c-layout` auf `max-width: 1200px; margin-inline: auto` (Mangel 5 Kopfzeile)
- Neue Klassen: `.d3c-aside-spots`, `.d3c-aside-spots.accent`, `.d3c-mob-spots-accent`

### frontend/app/pilot/[org]/d3c.test.tsx
4 neue Tests (Mangel 6):
- `no "Preis pro Kind" row in form step` — prüft Entfernung der alten Tabelle
- `step heads use labels not circles; "SCHRITT 1 VON 3" present` — prüft Kreis-Abwesenheit und Label-Anwesenheit
- `submit button text is exactly "Verbindlich anmelden · 149,00 €" for 149€ camp` — Mutationsprobe
- `consent cards are labels that contain their checkbox` — prüft Karten-Struktur

### frontend/app/pilot/[org]/RegistrationFormScreen.test.tsx
- Test `calls it a registration while places are left`: `toBe('Anmeldung absenden')` → `toContain('Verbindlich anmelden')` (wegen geändertem Knopftext)

### frontend/app/pilot/[org]/parent-journey.test.tsx
- Test `shows price, date, location, age and availability above the form`: sucht jetzt in `.d3c-aside` statt `.camp-summary`; `'6 bis 12 Jahre'` entfernt (Alter nicht mehr im Formularschritt angezeigt)

---

## SCREENSHOT-HINWEISE

- **Mobil (390px):** Nur kompakte aufklappbare Bar, keine Tabellen-Zusammenfassung oberhalb
- **Desktop (1440px):** Linke Spalte zeigt Foto + Camp-Info + Preis + Plätze (ggf. als Akzent); rechte Spalte hat Felder und sticky Dock am unteren Rand; Kopfzeile 1200px breit
- **Schritt-Köpfe:** „SCHRITT 1 VON 3" in Großbuchstaben über der Zwischenüberschrift, keine Kreise
- **Absende-Knopf:** „Verbindlich anmelden · 149,00 €"
- **Einwilligungs-Karten:** Größerer Text (15px), 24px-Checkbox, ganze Karte klickbar (label)

---

## NICHT_AUSGEFÜHRT

- Kein npm install, kein build, kein push
- Keine Änderungen an Feldnamen, Validierung oder API-Aufrufen
- `frontend/middleware.ts`, `frontend/proxy.ts`, Hero und Camp-Karten unverändert
- `CampSummary.tsx` existiert weiterhin (parent-journey.test.tsx nutzt es direkt für den Warteliste-Test)
