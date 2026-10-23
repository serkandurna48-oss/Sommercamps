feat/d2b-marketing-premium

STATUS: fertig zur Prüfung

COMMIT: ccd13d179c472501fba63f70e0e18ee650ecc165

TESTS:
- `npm run test --prefix frontend` → Test Files 59 passed, Tests 533 passed, 0 failed
- `npm run lint --prefix frontend` → 0 errors
- `npx tsc --noEmit -p frontend` → 0 errors

MUTATIONSPROBE:
Test m2pin prüft: reduced-motion → kein ScrollTrigger-Pin.
Wenn der `return`-Guard in SiteMotion.tsx (Zeile `if (reduce) { ... return }`) entfernt wird,
ruft der Code mm.add mit dem Desktop-Query auf → Mock-Callback erzeugt gsap.timeline mit
`{ pin: true }` → `pinCreatedConfigs.length === 1` → expect(pinCreatedConfigs).toHaveLength(0) schlägt fehl.

ÄNDERUNGEN:

### frontend/app/(marketing)/campspilot/marketing.css
- `.d2`: font-size `clamp(2.6rem, 5.5vw, 5.5rem)`, line-height `.95`, letter-spacing `-.03em`,
  `max-width: 16ch` (in ch-Einheiten der h2 selbst), `hyphens: auto`, `overflow-wrap: anywhere`
- `.sec-head` max-width: `600px` (war `22ch` auf 17-px-Basis ≈ 200px → zu eng für 79px-Headlines)
- `.sec-head.wide` max-width: `720px` (war `26ch` ≈ 250px)
- `.z-head` max-width: `600px` (war `20ch` ≈ 200px)
- `.btn`: `border-radius: 9999px`, `transition: transform 0.25s`, `padding: 0 26px`
- `.btn:hover`: `transform: scale(1.03)` ergänzt die bestehende Fill-Animation
- `.btn.ghost`: Glass-Stil (rgba-Hintergrund + backdrop-filter)
- `.sec`: `padding-block: clamp(72px, 9vw, 128px)`, mobil 72px fest
- Neu: `.ordnung-top` (5fr/7fr-Grid), `.ordnung-right` (position:relative, aspect-ratio 4/5, 28px Radius)
- `.z-resolve`: vereinfacht (war d3 + Fließtext, jetzt nur Wrapper für #zCampsPilot)
- `.z-list--animated .z-item { opacity: 0; transform: translateY(20px) }` — wird nur per JS gesetzt
- `@media prefers-reduced-motion`: Zettel-Endzustand (Strikes sichtbar, Text 30 % Deckung, #zCampsPilot sichtbar)

### frontend/app/(marketing)/campspilot/page.tsx
- `#ordnung`: Zweispalter (`ordnung-top` Grid) — Headline + Lead links, Leibchen-Bild rechts
  (`id="ordnungImg"`, fill-Mode, aspect-ratio 4/5 durch Container, 28px Radius)
- `data-group="feat"` auf `.feat` für koordinierten Stagger
- `#zResolve`: Inhalt auf `<p class="d1" id="zCampsPilot">CampsPilot</p>` reduziert

### frontend/app/components/marketing/SiteMotion.tsx
- Pin-Ende: `+=1300` → `+=900` (≤ 1 Viewport Scrollweg)
- Zettel-Ablauf neu: Phase 1 Punkte erscheinen (Stagger 0.12, Dauer 0.6, expo.out),
  Phase 2 Strikes + Fade auf 0.3, Phase 3 CampsPilot einblenden
- `z-list--animated`-Klasse per JS hinzugefügt (nie im SSR-Markup)
- `gsap.set('#zCampsPilot', { opacity: 0, y: 20 })` vor der Animation, `opacity: 1` am Ende
- Mobile-Branch: Klasse sofort entfernen, CampsPilot sofort sichtbar
- Feat-Karten: `data-group="feat"` → koordinierter `fromTo`-Stagger mit `stagger: 0.12`
- `data-rise` auf Feat-Items wird per JS entfernt (nach Gruppen-Registrierung)
- Parallax `#ordnungImg`: `yPercent: -7` (≈ 30–40 px Versatz)
- Cleanup: `z-list--animated` beim Unmount entfernen

### frontend/app/(marketing)/campspilot/marketing.test.tsx (neu)
- m1motion: SSR-Markup kein `opacity:0` als Inline-Style, alle Abschnittstexte vorhanden
- m2pin: reduced-motion → kein Pin registriert (GSAP-Mock mit sofort-invoked mm.add-Callback)
- m3ch: CSS `.d2` hat `max-width: Xch` mit X ≥ 12 (liest marketing.css direkt)
- m4pill: CSS `.btn` hat `border-radius: 9999px`

SCREENSHOT-HINWEISE:

**1440×900:**
- Hero: bleibt unverändert (gut laut Judge-Befund)
- „Der Zettel": beim Scrollen erscheinen die 5 Punkte nacheinander, werden durchgestrichen,
  „CampsPilot" blendet ein; kein 1300-px-Leerraum mehr (900 px Pin)
- „Die Ordnung": Headline + Lead links ~42 % Breite, Bild rechts ~58 %,
  28px Radius, Headlines brechen sauber in 2–3 Zeilen (nicht mehr wortweise)
- Abschnittsgrenzen: ≈ 128px Abstand auf Desktop
- Alle Buttons: Pill-Form (9999px Radius)

**390×844:**
- Headlines: clamp-Untergrenze 2.6rem = 41.6px, hyphens:auto für lange Wörter
- Kein horizontaler Überlauf (max-width 16ch + overflow-wrap: anywhere)
- „Die Ordnung": Bild oberhalb der Headline (order:-1 auf mobile), 1 Spalte
- Feat-Karten: 1 Spalte, Stagger-Reveal

NICHT_AUSGEFÜHRT:
- Build-Prüfung (`npm run build`) — kein build im Scope dieses Auftrags
- Manueller Browser-Test — visuell zu prüfen per Screenshot-Tool
- Deployment nach Render/Vercel — kein Push, kein Deploy per Auftrag
