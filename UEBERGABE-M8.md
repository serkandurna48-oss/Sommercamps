design/m8-a11y

STATUS: fertig zur Prüfung

COMMIT: (nach diesem Commit vergeben – siehe git log)

TESTS: npm run test --prefix frontend → 155 passed, 0 failed
       npx tsc --noEmit → keine Fehler

ÄNDERUNGEN:

1. Fokus-Ringe (publicTheme.css)
   - Globale Regel `.cp-public :focus-visible` war bereits vorhanden (2 px, brand-Farbe, 2 px Abstand).
   - Neu: `.h-akad :focus-visible`, `.h-trad :focus-visible`, `.ok-band :focus-visible` → `outline-color: #fff`
     (weiß auf dunklen Hero- und Band-Hintergründen für ausreichenden Kontrast).

2. Screenwechsel – Fokus auf h1 (tabIndex -1)
   - DoneScreen.tsx: h1 erhält `ref`, `tabIndex={-1}`, `role="status"` + `useEffect → focus()`.
   - ParentFlow.tsx (CampScreen): h1 erhält `ref`, `tabIndex={-1}` + `useEffect → focus()`.
   - ParentFlow.tsx (WaitScreen): h1 erhält `ref`, `tabIndex={-1}` + `useEffect → focus()`.
   - RegistrationFormScreen.tsx: visuell verstecktes `<h1 className="sr">` eingefügt,
     erhält `ref`, `tabIndex={-1}` + `useEffect → focus()`.
   - `window.scrollTo(0, 0)` war in ParentFlow bereits vorhanden.

3. Tastatur
   - Camp-Karten sind bereits `<button>` → Enter/Space nativ.
   - Marquee trägt `aria-hidden="true"` (war bereits in ParentFlow.tsx).
   - CSS: `.marquee-track:focus-within { animation-play-state: paused }` (ergänzt).
   - Keine Fokusfallen vorhanden.

4. Touch-Ziele ≥ 44 × 44 px (publicTheme.css)
   - `.nav-cta`, `.nav-cta-brand` → `min-height: 44px`.
   - `.h-btn-brand`, `.h-btn-line`, `.h-btn-glass`, `.h-btn-solid` → `min-height: 44px`.
   - `.back-link` → `min-height: 44px; padding-block: 8px`.
   - `.back` (Icon-Zurück-Button) war bereits 44 × 44 px.
   - `.consent` (Checkbox + Label) und `.faq-item summary` waren bereits ≥ 44 px.

5. Kontrast ≥ 4,5:1
   - `opacity: .7` aus `.cp-public .hero-hint` entfernt.
     Kompakt-Theme: var(--ink-2)=#38403c über weißem Hintergrund war bei 70 % Deckkraft
     ~4,43:1 (knapp unter WCAG AA). Ohne Opacity: 10,5:1. Tradition/Akademie unverändert
     ausreichend, da rgba-Farben schon eingebettet sind.
   - Platzhaltertexte: `::placeholder { color: var(--muted); opacity: 1 }` – verhindert
     Browser-Default (~50 % Transparenz), der in allen Themes unter 4,5:1 läge.
   - Alle anderen geprüften Farben (sec-label, t-lab, chips, hero-label) bestehen ≥ 4,5:1.

6. Mobil 360–390 px
   - `overflow-x: hidden` war bereits auf `.cp-public` gesetzt.
   - Formular-Eingaben: `font-size: 16 px` (base) / `17 px` (#s-form) → kein iOS-Zoom.
   - Neu: `scroll-margin-bottom: 120 px` auf `.cp-public #s-form .field` und `.consent` –
     sticky Preis-Leiste überdeckt keine Formularfehler mehr beim automatischen Scroll.

7. Tests (frontend/app/pilot/[org]/a11y.test.tsx, neu)
   - Statisch (renderToStaticMarkup): marquee-band aria-hidden, DoneScreen role="status",
     DoneScreen tabindex="-1", CampScreen tabindex="-1".
   - DOM (jsdom + react-dom/client): CampScreen fokussiert h1 nach Mount,
     DoneScreen fokussiert h1 nach Mount.
   - RegistrationFormScreen.test.tsx: `useEffect: () => {}` zum bestehenden React-Mock ergänzt.

NICHT_AUSGEFÜHRT:
- Visueller Browser-Test (kein GUI in dieser Umgebung).
- Build-Doppellauf (NEXT_PUBLIC_ACTIVE_CLUB=ksv / =jk) – der geänderte Code liegt
  ausschließlich im SaaS-Eltern-Flow (/pilot/), berührt keine KSV/JK-Shared-Komponenten.
