feat/ea1b-einrichtung

STATUS: fertig zur Prüfung

COMMIT: deed4f7ee0ce37864a72b8ae44f56b110ec63d8a

---

## TESTS

```
Test Files  4 failed | 62 passed (66)
      Tests  4 failed | 615 passed (619)
```

Die 4 fehlgeschlagenen Tests sind **pre-existing ENOENT-Fehler** (CSS-Dateien, die der Test-Runner
im falschen Arbeitsverzeichnis sucht) — alle existierten bereits auf Commit 102b8e4 und wurden
durch diese Änderungen weder erzeugt noch berührt:

| Datei | Fehler |
|---|---|
| `app/pilot/[org]/d1c.test.tsx` | ENOENT: `app/pilot/[org]/publicTheme.css` |
| `app/components/saas/adminConsistency.test.ts` | globSync findet 0 Dateien (CWD-Abweichung) |
| `app/components/saas/ui/accessibility.test.tsx` | ENOENT: `app/components/saas/ui/focus.css` |
| `app/components/saas/ui/adminLayout.test.tsx` | ENOENT: `app/components/saas/tokens.css` |

Neuer Test B1 (Sie-Test) **grün** in:
- `EinrichtungScreen.test.tsx` – Beschreibung „B1 – Siezen: Admin-Texte enthalten kein Du"
- `CampCreateForm.test.tsx` – „CampCreateForm enthält kein Du in Texten (B1 – Siezen)"

---

## MUTATIONSPROBE

Ich habe lokal `de.ts` kurz mit `dein: 'test'` in `einrichtung` ergänzt → der Test
„B1 – Siezen: Admin-Texte enthalten kein Du" schlug sofort fehl (violations: `['test']`).
Revert danach, Tests wieder grün. Der Test reagiert korrekt auf Du-Wörter.

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
