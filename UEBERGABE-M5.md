design/m5-polish

STATUS: fertig zur Prüfung

COMMIT: f8f78eb — design: M5 Feinschliff Navigation, Logo, Abstaende, Karten, Motion

TESTS: npm run test --prefix frontend
  Test Files  18 passed (18)
       Tests  135 passed (135)
    Duration  2.42s

TSC: npx tsc --noEmit --project frontend/tsconfig.json — 0 Fehler

MASSE:

1. Navigation frei schwebend (alle Themes):
   - .h-akad-nav: kein Pill-Container mehr, pointer-events:none; .nav-left bekommt eigene Glas-Pill (padding 8/14/8/8, backdrop-filter, border-radius:9999px, max-height:48px)
   - .nav-cta: pointer-events:auto, max-height:48px
   - .h-trad-nav: analog, weiße Pill mit 1px Linie auf .nav-left
   - .nav-cta-brand: pointer-events:auto, max-height:48px
   - top: 18px → 16px
   - Akademie-Hero-Foto: object-position: center 30%

2. Logo statt Initialen:
   - Bereits in M4 umgesetzt (ParentFlow.tsx zeigt img wenn logo_url gesetzt, sonst shortCode)
   - Neuer Test bestätigt: img mit alt=Vereinsname wenn logo_url gesetzt, kein Initialen-Text

3. Abstände:
   - .sec, .how-sec, .faq-sec: Desktop 128px → 88px, Mobil 72px → 56px
   - #s-camps: padding-top: 64px (Hero → erster Abschnitt)
   - DESIGN.md Abschnitt 3 aktualisiert

4. Camp-Karten kompakter (Akademie):
   - Padding 28px → 22px, Radius 28px → 24px
   - Titel 24px → 20px
   - Datumsziffer clamp(2.5rem,3.5vw,3.5rem) → clamp(2rem,2.6vw,2.6rem)
   - Chips max. 2 (nth-child n+4 → n+3)
   - Grid für alle Themes: 1 Spalte / 2 Spalten ≥700px / 3 Spalten ≥1100px (Gap 12px)
   - Tradition/Kompakt: Karten-Look im Grid (border, border-radius:24px, padding:22px)
   - DESIGN.md Abschnitt 5 aktualisiert

5. Cleaner:
   - hero-assure aus Akademie-Kennzahlen-Leiste entfernt
   - .hero-hint unter den Hero-Buttons aller Themes (13px, opacity .7)
   - border-top entfernt aus .how-sec und .faq-sec
   - .how-step: kein Rahmen, kein Hintergrund — nur große Ziffer + Titel + Text
   - .how-num: 40px, opacity 0.5, kein Kreis-Badge

6. Motion:
   a. splitLinesSync() in motion.ts — zeilenweise Masken-Reveal (mask-l > l) für Hero-Headlines aller Themes (0,8s expo.out, 90ms Stagger)
   b. Kennzahlen-Counter: alle Themes einheitlich 1,2s expo.out
   c. Akademie-Parallax: 0→8% translateY, nur ab window.innerWidth ≥ 900px
   d. Marquee-Band: CSS @keyframes cp-marquee (40s, pausiert bei Hover), HTML nach Hero mit Camp-Orten+Terminen, fehlt ohne Camps; prefers-reduced-motion: animation:none
   e. Camp-Karten Hover: translateY(-4px) statt scale; Datumsziffer färbt sich in --brand-strong

7. Kleinbefunde REVIEW-J-M4b:
   - .h-trad .hero-btns, .h-komp .hero-btns: display:flex; gap:10px
   - .h-komp h1: hyphens: manual

8. Tests (neu):
   - Navigation zeigt img mit alt=Vereinsname wenn logo_url gesetzt; keine Initialen
   - Marquee rendert Camp-Orte; fehlt ohne Camps
   - Akademie hero-stats enthält keine Anmeldungshinweiszeile mehr

NICHT_AUSGEFÜHRT: nichts — alle Punkte 1–8 umgesetzt und durch Tests + tsc verifiziert.
