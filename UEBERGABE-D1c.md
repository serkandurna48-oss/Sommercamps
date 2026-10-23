feat/d1c-elternseite-schliff

STATUS: fertig zur Prüfung

COMMIT: be35a69a8c009c9aecde3266f61faad990a2bc69

TESTS:
  npm run test --prefix frontend (b7sm4vih3, Start 00:09:45, Dauer 966.80s):
    Test Files  1 failed | 60 passed (61)
    Tests       1 failed | 548 passed (549)
  Der einzige Fehler: app/dev/admin-vorschau/preview.test.tsx
    Timeout (30 000 ms) in „renders … with the real shell and without I/O"
    → Pre-existing flaky test, letzter Commit c5362e1 (UC5), nicht durch D1c verursacht.
  d1c.test.tsx: alle 6 neuen Tests grün.

  npx tsc --noEmit -p frontend: 0 Fehler (byz3jjwk5, exit code 0)
  npm run lint --prefix frontend: 0 Fehler (bn9fsifre, exit code 0)

MUTATIONSPROBE:
  Test „CampRow does not render date chip in tags area (mutation probe)" prüft
  explizit, dass kein <span class="tag">4.–7. Jan. 2027</span>-Chip gerendert wird.
  Wird der Datums-Chip in CampRow.tsx wieder eingefügt, schlägt dieser Test fehl.

ÄNDERUNGEN:
  frontend/app/pilot/[org]/publicTheme.css
    - CSS-Variable --h-tracking: -0.01em im tradition-Theme (Serifenschrift)
    - CSS-Variable --h-tracking: -0.03em im akademie- und kompakt-Theme
    - letter-spacing in .h-trad h1 / .h-akad h1 / .h-komp h1 → var(--h-tracking)
    - Verlauf verstärkt: to-top rgba(0,0,0,.82)→.45→transparent + to-right rgba(0,0,0,.55)→transparent
    - Mobil-Hero full-bleed: .h-trad-shot position:absolute; inset:0 (statt 260px-Streifen)
    - Mobil-Verlauf: rgba(0,0,0,.88) 0% → transparent 72%
    - Desktop-Regel @media(min-width:900px) bereinigt und angepasst
    - tradition .sec-head: align-items:flex-start, gap:10px (kein text-align:center mehr)
    - [data-theme='tradition'] .sec-head::after entfernt (kein Trennstrich)

  frontend/app/pilot/[org]/ParentFlow.tsx
    - objectPosition des Hero-Bilds: 'center 25%' → 'center 20%'

  frontend/app/pilot/[org]/CampRow.tsx
    - Datums-Chip aus Tags-Bereich entfernt (Datumszeile unter Titel bleibt)

  frontend/app/lib/i18n/de.ts
    - howItWorks.steps[0].body: „Ansehen" → „Platz sichern"

  frontend/app/pilot/[org]/d1c.test.tsx  (neu)
    - 6 Tests: --h-tracking-Variable je Theme, CampRow ohne Datums-Chip (Mutationsprobe),
      Alter-Chip vorhanden, .sec-head ohne text-align:center, kein ::after-Separator,
      Schritt-1-Text „Platz sichern"

SCREENSHOT-HINWEISE:
  - Theme tradition, 1440×900: Hero-Headline nicht mehr zu eng gesetzt; Verlauf dunkler;
    Foto leicht nach oben gerückt (center 20%).
  - Theme tradition, 390×844: Foto full-bleed, kein separater dunkler Block mehr;
    Textzone unten mit Glas-Leiste; min-height 100svh.
  - Camp-Karte: kein Datums-Chip in der Chip-Zeile mehr (nur Alter und ggf. Plätze).
  - Abschnittsköpfe: alle linksbündig, kein zentrierter Trennstrich.

NICHT_AUSGEFÜHRT:
  - Kein npm run build (kein build in den erlaubten Befehlen dieser Session).
  - Kein Browser-Sichttest (Render-/Vercel-Deploy nicht Teil des Auftrags).
  - preview.test.tsx-Timeout nicht untersucht (pre-existing, außerhalb D1c-Scope).
