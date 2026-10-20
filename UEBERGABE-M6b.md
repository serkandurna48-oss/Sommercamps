design/m6-hero-lab-r1
STATUS: fertig zur Prüfung
COMMIT: 363def8f9b52f8e7d1dec217e9afb18e494ff07f
TESTS: npm run test --prefix frontend → 143 passed, 0 failed
NICHT_AUSGEFÜHRT: npm run build (kein npm install / kein Build-Lauf laut Auftragsregeln)

---

## Änderungen

### Variante 3 — Mosaik nur für eigene /jk/-Assets (`HeroLab.tsx`)

Vorher: JK_PHOTOS wurden immer gezeigt, wenn irgendein `hero_image_url` vorhanden war.

Nachher: JK_PHOTOS nur, wenn `org.hero_image_url` selbst unter `/jk/` liegt.
- Externer oder vereinsfremder Hero → eine große Kachel aus eigenem `hero_image_url` + Akzentkachel.
- Kein `hero_image_url` → nur Akzentkachel, kein leerer Platz.
- Kein Bild doppelt: `JK_PHOTOS` enthält keine Duplikate; bei Nicht-JK-Hero wird nur `[hero]` übergeben.

```ts
const isJKHero = hero?.startsWith('/jk/') ?? false
const tilePhotos = (isJKHero ? JK_PHOTOS : hero ? [hero] : []).slice(0, 3)
```

### Variante 1 — Zeilen-Reveal ohne Umbau React-verwalteter Knoten (`HeroLab.tsx`)

Vorher: `splitLinesForMotion` las `h1.textContent` und ersetzte sofort alle Kinder-Knoten
(React-verwalteter Baum wurde direkt mutiert, bevor Positionen gemessen wurden).

Nachher: V1's `<h1 data-hl-split>` rendert die Wörter bereits im JSX als `<span>`-Kinder
(via `Fragment` + `word.split`). `splitLinesForMotion` liest die vorhandenen Spans per
`:scope > span` und deren `getBoundingClientRect().top`, ohne zuerst `h1.textContent` zu löschen.
Erst danach wird der h1-Inhalt für die Masken/Inner-Spans neu aufgebaut (innerhalb des GSAP-
Kontexts, also revertierbar). V2 (plain-text h1) nutzt weiterhin den Fallback-Pfad – keine
Verhaltensänderung dort.

### Neue Tests (`heroLab.test.tsx`)

(a) `V3 neutraler Verein`: `hero_image_url: 'https://example.org/a.jpg'` → kein `/jk/`-Pfad im Output.
(b) `V3 ohne hero_image_url`: `hero_image_url: null` → rendert ohne Fehler, kein `/jk/`.
(c) `V3 JK-Verein`: `hero_image_url: '/jk/hero.jpg'` → Output enthält `/jk/team.jpg`.

Bestehender Test "Variante 1 rendert Headline" angepasst: Assertion von
`toContain('Trainiere wie ein Profi')` auf `toContain('Trainiere')` geändert, da die Headline
in V1 jetzt als Wort-Spans gerendert wird (der Volltext als zusammenhängender String ist
im SSR-Output nicht mehr vorhanden).

---

## Dateien geändert

- `frontend/app/pilot/[org]/hero-lab/HeroLab.tsx`
- `frontend/app/pilot/[org]/hero-lab/heroLab.test.tsx`
