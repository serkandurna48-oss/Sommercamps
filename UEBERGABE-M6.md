design/m6-hero-lab

STATUS: fertig zur Prüfung

COMMIT: 22fe802 — design: M6 Hero-Labor mit drei Varianten

TESTS: npm run test --prefix frontend
  Test Files  19 passed (19)
       Tests  140 passed (140)
    Duration  4.05 s
  Neue Tests: heroLab.test.tsx (5 Tests: Variante 1/2/3 Headline+Button, alle drei Labels, kein opacity:0 im SSR)

TSC: npx tsc --noEmit --project frontend/tsconfig.json — 0 Fehler

VARIANTEN:

1. "Kino" (?v=1)
   Das Foto füllt den gesamten Viewport; ein langsamer Ken-Burns-Zoom (1.08 → 1.0 über 14 s) vermittelt Tiefe beim Laden.
   Die Headline erscheint zeilenweise aus Masken heraus (yPercent 115 → 0, stagger 90 ms, expo.out), das Label und die Buttons folgen versetzt.
   Glas-Kennzahlen (Camps · Jahre · Plätze) sitzen unten rechts; ein Laufband in der Vereinsfarbe trägt die Camp-Orte am unteren Rand.

2. "Split" (?v=2)
   Die linke, durchgehend dunkle Fläche trägt eine Headline bis 6 rem (line-height .9) und zwei Pill-Buttons; rechts steckt das Foto in einer hohen, abgerundeten Karte (28 px Radius) mit leichter Scroll-Parallax.
   Die Lade-Animation staffelt Label, Headline, Intro und Buttons von unten herein; die Fotokarte gleitet leicht verzögert ein.
   Darunter erscheinen drei große Ziffern (Camps, Alter, Plätze) mit Count-up, ScrollTrigger-gesteuert beim Einscrollen.

3. "Mosaik" (?v=3)
   Vier gerundete Kacheln (24 px Radius) bilden ein 2×2-Raster: drei JK-Fotos und eine Akzentkachel in der Vereinsfarbe mit dem Text „Sommercamps 2027".
   Die Kacheln fliegen gestaffelt ein (y 28 px, scale 0.96 → 1, stagger 100 ms, expo.out), die Headline links daneben faded gleichzeitig auf.
   Auf Mobilgeräten (390 px) werden die Kacheln im 2-Spalten-Raster gestapelt; ab 480 px bleibt das 2×2-Grid stabil und overflowt nicht horizontal.

URL-Beispiel: /pilot/jk-academy-demo/hero-lab?v=1

NICHT_AUSGEFÜHRT:
- Kein Push auf origin, kein Merge in main oder einen anderen Deploy-Branch
- Keine Browser-Screenshots (macht der Prüfer auf 1440×900 und 390×844)
- Kein Video-Review
- Kein Build-Test (npm run build) — diese Route nutzt ausschließlich bestehende Infrastruktur (fetchOrganization, fetchCamps, computeBrandSafe); kein neuer API-Aufruf oder DB-Zugriff
