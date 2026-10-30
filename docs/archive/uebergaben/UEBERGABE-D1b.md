# Übergabe D1b — Elternseite Premium

Branch: `feat/d1b-elternseite-premium`

---

## Erledigt

Alle 8 Punkte des Auftrags vollständig umgesetzt.

---

## Änderungen nach Datei

### `frontend/app/pilot/[org]/campUtils.ts` (neu)
- `getTodayBerlin()`: aktuelles Datum als YYYY-MM-DD im Europe/Berlin-Timezone.
- `filterFutureCamps()`: filtert Camps mit `end_date < heute` heraus; heutiger Tag bleibt sichtbar (`>=`). Mutations-Probe: `>=` → `>` lässt d1b.test.tsx rot werden.
- `truncateIntroForHero()`: kürzt Intro auf ersten Satz (max. 140 Zeichen) oder Wortgrenze mit `…`.

### `frontend/app/pilot/[org]/clubAssets.ts` (neu)
- Feste Zuordnung Org-Slug → lokale Club-Bilder.
- `ksv-baunatal`: Hero `ksv-gruppenfoto.jpg`, Galerie 3 Bilder, Logo `ksv-logo.png`.
- Unbekannter Slug → `null` (kein Fallback auf fremde Vereine).

### `frontend/app/pilot/[org]/page.tsx`
- Camps per `filterFutureCamps()` vorfiltern, bevor sie an `ParentFlow` übergeben werden.
- `hadPastCamps` prop berechnen und weitergeben.

### `frontend/app/pilot/[org]/ParentFlow.tsx`
- `hadPastCamps` prop (default `false`) für unterschiedliche Leer-Meldungen.
- Hero-Bild-Auflösung: `org.hero_image_url` → Club-Fallback → kein Bild.
- Intro im Hero: `truncateIntroForHero()`.
- Galerie-Band: bis zu 3 Club-Bilder, Hero-Bild herausgefiltert, nach `data-section` für Scroll-Reveal.
- „Über uns"-Abschnitt: vollständiger `intro_text` nach den Camps.
- Mobile Sticky CTA: erscheint wenn Hero aus dem Viewport scrollt, verschwindet im Footer.
- Aktueller Leer-Zustand: Unterscheidung `hadPastCamps` → „Neue Termine folgen in Kürze." mit Kontakt-Pill.

### `frontend/app/pilot/[org]/CampRow.tsx`
- Chips reduziert auf max. 2: Zeitraum (Datumsspanne) + Alter. Location, care_info, meals_info entfernt.
- Restplätze-Chip „Noch N Plätze" nur wenn `spots_remaining ≤ 10 && !is_full`.
- CTA-Text: „Ansehen" → „Platz sichern".

### `frontend/app/pilot/[org]/publicTheme.css`
- **Tradition-Hero Desktop**: `h-trad-shot` jetzt `position: absolute; inset: 0` (full-bleed statt rechter Karte).
- **Gradient-Veil**: `h-trad-shot::after` mit Links-nach-Rechts + Unten-Gradient (wie Akademie).
- **Ken-Burns**: `h-trad-shot img` mit `cp-hero-ken-burns 14s ease-out` (war `h-trad .shot img` → tote Regel).
- **Glass Stats Bar**: `h-trad-stats` von weißer Karte auf `rgba(255,255,255,.06)` + `backdrop-filter: blur(12px)`, Texte weiß.
- **Hover translateY(-4px)**: Tradition und Kompakt Camp-Karten.
- **Datum-Akzent beim Hover**: `.camp:hover .c-date .num { color: var(--brand-strong) }`.
- **Gallery Band**: `.gallery-band` (flex, mobile scroll-snap, desktop side-by-side), `.gallery-img-wrap` (height 280px, radius 28px).
- **Sticky CTA**: `.sticky-cta` (fixed bottom, glass, `translateY(110%)` → `translateY(0)` mit Klasse `.sticky-cta-on`), sicher hinter `@media (min-width: 900px) { display: none }`.
- **sec-body-text**: 16px, line-height 1.65, `var(--ink-2)`, max 65ch.

### `frontend/app/pilot/[org]/motion.ts`
- `_isMotionEnabled()` exportiert (für Reduced-Motion-Test).
- `useParentFlowMotion` nutzt `_isMotionEnabled()` statt direktem `matchMedia`-Aufruf.
- **Lenis Smooth Scroll**: dynamischer Import, nur Desktop (≥ 900 px) und ohne reduced-motion, sauberes RAF-Cleanup.
- **Galerie-Parallax**: `[data-gallery-img]` per GSAP ScrollTrigger, `y: 0 → -40px scrub`.

### `frontend/app/pilot/[org]/d1b.test.tsx` (neu)
14 Tests:
- clubAssets: Fallback für ksv-baunatal, kein Fallback für unbekannten Slug.
- truncateIntroForHero: ≤140 unverändert, Satzgrenze, Wortgrenze.
- filterFutureCamps: heute sichtbar (Mutations-Probe), gestern gefiltert.
- CampRow: Spots-Chip bei ≤10, kein Chip bei >10, CTA-Text.
- Gallery: kein Band für Org ohne Assets, Band für ksv-baunatal mit Duplikat-Filter.
- SSR: kein `opacity:0` inline.

### `frontend/app/pilot/[org]/d1b-reduced-motion.test.ts` (neu)
- `// @vitest-environment jsdom`
- `_isMotionEnabled()` gibt `false` bei `prefers-reduced-motion: reduce`, `true` sonst.

---

## Testergebnis

```
Tests  543 passed (543)   — 0 failed
Lint   0 errors
tsc    0 errors
```

---

## SHA

Getesteter Commit: `4be38f9` (Branch `feat/d1b-elternseite-premium`).

---

## Offen / Nächster Schritt

- PR öffnen, Review durch zweite Person, dann Merge nach `main` durch Serkan.
- Browser-Verifikation auf /pilot/ksv-baunatal (Staging) empfohlen: Ken-Burns, Galerie-Parallax, Sticky CTA.
