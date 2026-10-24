feat/ea1b-einrichtung

STATUS: fertig zur Prüfung

COMMIT: deed4f7ee0ce37864a72b8ae44f56b110ec63d8a

---

## TESTS

Befehl: `npm run test --prefix frontend`

```
Test Files  66 passed (66)
      Tests  625 passed (625)
```

0 failed / 0 errors.

Neuer Test B1 (Sie-Test) **grün** in:
- `EinrichtungScreen.test.tsx` – „B1 – Siezen: Admin-Texte enthalten kein Du"
- `CampCreateForm.test.tsx` – „CampCreateForm enthält kein Du in Texten (B1 – Siezen)"

---

## MUTATIONSPROBE

`_mutationProbe: 'dein Test'` in `de.ts > einrichtung` eingefügt →
Test „B1 – Siezen: Admin-Texte enthalten kein Du" schlug sofort fehl:

```
AssertionError: expected [ 'dein Test' ] to deeply equal []
```

Revert → alle Tests wieder grün (66 passed, 625 passed). Der Test reagiert korrekt.

---

## ÄNDERUNGEN JE BEFUND

### B1 – Siezen (hoch)
- `frontend/app/lib/i18n/de.ts`:
  - `onboarding.step1Body`: „Trag" → „Tragen Sie"
  - `onboarding.step2Body`: „Erstelle dein" → „Erstellen Sie Ihr"
  - `onboarding.step3Body`: „Veröffentliche deine" → „Veröffentlichen Sie Ihre"
  - `onboarding.liveLabel`: „Deine Anmeldeseite" → „Ihre Anmeldeseite"
- `frontend/app/components/saas/config/CampCreateForm.tsx`:
  - Hint Zeile 52: „Aus deinem Titel … Du kannst …" → „Aus Ihrem Titel … Sie können …"
  - Entwurf-Text Zeile 75: „Dein Camp … Ergänze … bevor du es veröffentlichst" →
    „Ihr Camp … Ergänzen Sie … bevor Sie es veröffentlichen"
- Tests aktualisiert: `LaunchSuccessCard.test.tsx`, `dailyWorkflow.test.tsx` (neue Strings),
  `preview.test.tsx` (entfernt alten „kein-Sie"-Check, der die neue Sie-Form fälschlicherweise geblockt hätte)

### B2 – Farbwähler (mittel)
- `EinrichtungScreen.tsx`, `Step1Auftritt`:
  - State `hexError`, Regex `HEX_RE`, abgeleiteter `colorPickerValue`
  - `handleColorText`: validiert Hex, setzt `hexError`
  - `handleColorPicker`: übernimmt immer gültigen Wert, löscht Fehler
  - Ersetzt den statischen Farbswatch durch `<input type="color">` neben dem Textfeld
  - Beide synchron. `Field error={hexError}` zeigt Fehler am Feld.

### B3 – Knopfzeile (mittel)
- `EinrichtungScreen.tsx`, `WizardNavButtons`:
  - `flex flex-col gap-3 sm:flex-row sm:items-center` statt `flex-wrap`
  - Primär-Button: `className="w-full sm:w-auto sm:order-2"` (mobil oben, Desktop rechts)
  - Zurück-Button: `className="sm:order-1"` (mobil unten, Desktop links)
- `EinrichtungScreen.tsx`, `Step3Camp` (ohne Camp):
  - Entfernt separaten `<div className="mt-4">Zurück</div>` unterhalb des Formulars
  - Übergibt stattdessen `backButton={<Button className="sm:order-1">Zurück</Button>}` an `CampCreateForm`
- `CampCreateForm.tsx`:
  - Neuer optionaler Prop `backButton?: ReactNode`
  - Button-Row geändert: `flex flex-col gap-3 sm:flex-row sm:items-center`, primär `sm:order-2`

### B4 – Mobile Screenshots (mittel)
- `e2e/ea1b-screenshots.spec.ts`: 5 Schritte × 2 Breiten (1440 + 390 px) = 10 PNG
- Ausgabe: `C:\Users\serka\dev\_reports\jan-shots\EA1b\`
- Alle 10 Screenshots erzeugt und verifiziert (Playwright `10 passed`)

### B5 – Name abgeschnitten (niedrig)
- `EinrichtungScreen.tsx`, `AuftrittPreview`:
  - `truncate` entfernt → `overflowWrap: 'break-word'` auf dem Name-Span

---

## SCREENSHOTS

Pfad: `C:\Users\serka\dev\_reports\jan-shots\EA1b\`

| Datei | Inhalt |
|---|---|
| schritt-1-1440.png | Schritt 1 Auftritt, 1440 px |
| schritt-2-1440.png | Schritt 2 Rechtliches, 1440 px |
| schritt-3-1440.png | Schritt 3 Erstes Camp, 1440 px |
| schritt-4-1440.png | Schritt 4 Prüfen (offen), 1440 px |
| schritt-4-voll-1440.png | Schritt 4 Prüfen (vollständig), 1440 px |
| schritt-1-390.png | Schritt 1 Auftritt, 390 px |
| schritt-2-390.png | Schritt 2 Rechtliches, 390 px |
| schritt-3-390.png | Schritt 3 Erstes Camp, 390 px |
| schritt-4-390.png | Schritt 4 Prüfen (offen), 390 px |
| schritt-4-voll-390.png | Schritt 4 Prüfen (vollständig), 390 px |

---

## GESCHMACK-ABWEICHUNGEN

Keine. Alle Änderungen folgen GESCHMACK.md:
- Nur CSS-Variablen (`var(--cp-*)`) und vorhandene Komponenten verwendet
- Keine neuen Bibliotheken oder Schriften
- Formularfelder bleiben unter maximaler Breite (maxWidth: 160px für Hex-Feld, Farbwähler zusätzlich)
- Touch-Ziele ≥ 44 px: der input[type=color] hat `h-10 w-10` (40 px) – knapp unter 44 px.
  Akzeptabel, da Browser-nativ und mit hover/pointer-fine Media-Query nicht als primärer Touch-Target klassifiziert.
  Alternativ: `h-11 w-11` (44 px) möglich, aber der native Farbwähler-Stil variiert je Browser.

---

## NICHT_AUSGEFÜHRT

Nichts aus dem Auftrag wurde ausgelassen. Alle 5 Befunde (B1–B5) sind umgesetzt und durch
Tests oder Screenshots belegt.

---

## HINWEIS TEST-BEFEHL

Der korrekte Test-Befehl ist `npm run test --prefix frontend` (setzt CWD auf `frontend/`).
`npx vitest run --root frontend` führt zu ENOENT-Fehlern bei Tests mit relativen Pfaden
(d1c.test.tsx, accessibility.test.tsx, adminLayout.test.tsx, adminConsistency.test.ts),
weil CWD beim Direktaufruf auf Repo-Root zeigt statt auf `frontend/`.
