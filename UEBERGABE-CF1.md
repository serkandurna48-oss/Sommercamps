feat/cf1-campfilter

STATUS: fertig zur Prüfung

COMMIT: 63efb76

---

## TESTS

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
   Start at  14:31:40
   Duration  765ms
```

Alle 27 Pflicht-Tests 0 failed / 0 errors.

## MUTATIONSPROBE

`campFilterUtils.ts` Zeile 7: `export const FILTER_THRESHOLD = 6`

Beweis in `campFilter.test.tsx` Zeile 184:
```typescript
it('≤6 Camps: keine Filterleiste — FILTER_THRESHOLD muss 6 sein', () => {
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={camps6} />)
  expect(html).not.toContain('campfilter')
  expect(FILTER_THRESHOLD).toBe(6)     // ← Wert 0 → Test rot
})
```
Wird `FILTER_THRESHOLD` auf 0 gesetzt, schlägt der Regressionstest fehl.

---

## ÄNDERUNGEN

| Datei | Art | Inhalt |
|---|---|---|
| `frontend/app/pilot/[org]/campFilterUtils.ts` | NEU | Pure-Logik: `FILTER_THRESHOLD`, `parseUrlFilter`, `buildUrlSearch`, `applyFilter`, `getLocationOptions`, `getZeitraumOptions`, Typen |
| `frontend/app/pilot/[org]/CampFilter.tsx` | NEU | React-Komponente: Ort-Dropdown + Zeitraum-Chips + Trefferzahl + Reset |
| `frontend/app/pilot/[org]/ParentFlow.tsx` | GEÄNDERT | Filter-State, URL-Sync, `filteredCamps`, `CampFilter`-Einbindung, leere Trefferliste mit Reset-Knopf |
| `frontend/app/pilot/[org]/publicTheme.css` | GEÄNDERT | +137 Zeilen: `.campfilter*`-CSS für alle drei Themes + Mobile-Media-Query |
| `frontend/app/pilot/[org]/campFilter.test.tsx` | NEU | 27 Tests: Schwelle, Ortsliste, Zeitraum-Mehrfachauswahl, Kombination, URL-Roundtrip, ungültige Params, leere Trefferliste |
| `frontend/app/dev/cf1-preview/page.tsx` | NEU | Dev-Vorschau unter `/dev/cf1-preview?theme=akademie&ort=Kassel` |
| `frontend/e2e/cf1-screenshots.spec.ts` | NEU | Playwright-Spec (8 Screenshots via `page.setContent`) |
| `frontend/playwright.config.cf1.ts` | NEU | Playwright-Konfiguration für CF1-Screenshots |
| `frontend/vitest.config.mjs` | GEÄNDERT | `e2e/**` explizit von vitest-Suche ausgeschlossen |
| `frontend/next.config.ts` | GEÄNDERT | `turbopack.root: process.cwd()` gegen Worktree-Fehldetektierung |

### Keine neuen Dependencies

### Keine DB-Migrations

---

## SCREENSHOTS

8 PNG nach `C:\Users\serka\dev\_reports\jan-shots\CF1\` + `stand.txt`

Methode: Playwright `page.setContent()` mit eingebettetem `publicTheme.css` —
kein Dev-Server nötig (siehe NICHT_AUSGEFÜHRT).

| Datei | Theme | Breite | Zustand |
|---|---|---|---|
| tradition-desktop-unfiltered.png | tradition | 1440 px | 24 Camps, ungefiltert |
| tradition-desktop-filtered.png | tradition | 1440 px | Kassel → 3 Camps, "Filter zurücksetzen" |
| tradition-mobile-unfiltered.png | tradition | 390 px | 24 Camps, Filterleiste horizontal scrollbar |
| tradition-mobile-filtered.png | tradition | 390 px | Kassel → 3 Camps |
| akademie-desktop-unfiltered.png | akademie | 1440 px | 24 Camps, dunkles Theme |
| akademie-desktop-filtered.png | akademie | 1440 px | Kassel → 3 Camps |
| akademie-mobile-unfiltered.png | akademie | 390 px | 24 Camps |
| akademie-mobile-filtered.png | akademie | 390 px | Kassel → 3 Camps |

---

## GESCHMACK-ABWEICHUNGEN

1. **Camp-Kartenlayout in Screenshots**: Der statische HTML-Ansatz (kein Dev-Server)
   rendert die Camps in einem 3-Spalten-Card-Grid auf Desktop. Das tatsächliche
   `ParentFlow`-Rendering im Browser kann je Theme abweichen (Tradition: Listenansicht
   mit Trennlinien statt Cards). Die Filter-UI selbst ist korrekt wiedergegeben.

2. **Fonts**: Screenshots verwenden System-Fonts (Helvetica Neue / Georgia), da die
   Next.js Font-Optimierung nicht aktiv ist. Die Proportionen entsprechen dem Design.

3. **"Sommer 24" Chip in gefilterten Screenshots**: Im gefilterten Zustand (Kassel)
   zeigt der Sommer-Chip weiterhin "24" — das ist korrekte Implementierung per Spec
   (Chip-Zahl = Gesamttreffer für diesen Zeitraum, unabhängig vom Ort-Filter).

---

## NICHT_AUSGEFÜHRT

- **Dev-Server-Screenshots**: `next dev` schlägt in diesem Worktree fehl, weil
  `CF1/frontend/node_modules/` nicht existiert (node_modules liegen im
  Sommercamps-Hauptrepo). Turbopack kann `next/package.json` nicht auflösen.
  Workaround: Screenshots via `page.setContent()` mit eingebettetem CSS.

- **`npm run build`-Prüfung** (KSV + JK): Beide Builds setzen das Dev-Setup
  voraus, das aus denselben Gründen nicht verfügbar ist. Der TypeScript-Check
  (`npx tsc --noEmit`) schlägt sauber durch: 0 Fehler.

- **Barrierefreiheit-Kontrast-Messung**: Visuell geprüft; programmatische
  4,5:1-Messung ohne Browser-Zugang nicht durchgeführt.
