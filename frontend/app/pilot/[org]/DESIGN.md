# DESIGN.md – Elternseite (`/pilot/[org]`)

Verbindlich für jede Design-Änderung an der Elternseite. Jeder Auftrag verweist hierauf, der Prüfer misst dagegen.
Maßstab: Referenzen in `C:\Users\serka\dev\_reports\leitstand\referenzen\motionsites\` (Asme, Halo, Dental, SkyElite). Richtung für JK/akademie: dunkel, Glas, eine Akzentfarbe (Vereinsfarbe).
Stand: 19.10.2026, Judge. Änderungen nur mit Begründung in der Übergabe.

## 1. Grundregeln (gelten für alle Themes)
1. Pro Viewport wenige Elemente: ein Bild, eine Aussage, ein Satz, 1–2 Aktionen. Informationsdichte kommt erst nach dem ersten Scroll.
2. Hierarchie über Größe und Gewicht, nicht über Farbe. Genau eine Akzentfarbe (`--brand-strong`), sonst Schwarz/Weiß/Transparenzen.
3. 8-Punkt-Raster: alle Abstände aus 8, 16, 24, 32, 48, 72, 128.
4. Zeilenlänge 42–72 Zeichen für Fließtext; Headlines maximal 20ch.
5. Kontrast ≥ 4,5:1 für Text; Text auf Fotos nur über Verlauf (siehe 4.1).
6. Radien aus einer Familie: 9999px (Pill), 28px (große Karte), 24px (Karte), 12px (Chip).
7. Bewegung ruhig: Headline-Reveal 0,8 s zeilenweise (90 ms Versatz), Scroll-Reveal 0,6 s, Hover 0,25 s, nie als Bedingung für Sichtbarkeit (SSR vollständig sichtbar), `prefers-reduced-motion` schaltet alles ab.
8. Keine Template-Signale: keine nummerierten Kreise in gleichen Kästen, keine Bootstrap-Akkordeons, keine Icon-Reihen, keine „Features“-Grids.

## 2. Typografie
- Skala (Modul 1,25): 13 · 15 · 17 · 20 · 24 · 32 · 40 · 56 · 72 · 96 · 120 px.
- Label: 13px, Großbuchstaben, `letter-spacing: .22em`, Deckung 0,65.
- Headline (h1) nach Textlänge – Funktion `headlineScale(text)` in ParentFlow.tsx:
  - xl (≤ 24 Zeichen): `clamp(2.8rem, 8vw, 7.5rem)`
  - lg (≤ 48): `clamp(2.4rem, 6vw, 5.5rem)`
  - md (> 48): `clamp(2rem, 4.6vw, 4.25rem)`
  - immer `line-height: .92; letter-spacing: -.03em; max-width: 20ch`; `lang="de"`, `overflow-wrap: anywhere; hyphens: auto`.
- Abschnittsüberschrift (h2): `clamp(2rem, 4.5vw, 3.5rem)`, `letter-spacing: -.02em`, davor immer ein Label.
- Kartentitel: 24px/600. Fließtext: 17px (mobil) – 18px (Desktop), Zeilenhöhe 1,55. Kleintext: 13–15px.

## 3. Abstände und Raster
- Seitenränder: 24px mobil, `7vw` ab 900px; Inhaltsbreite max. 1120px (Navigation) bzw. 1200px (Abschnitte).
- Abschnittsabstand (`.sec`): 56px mobil, 88px ab 900px.
- Abstand Hero → erster Abschnitt: 64px (padding-top von `#s-camps`).
- Camp-Grid: 1 Spalte bis 699px, 2 Spalten 700–1099px, 3 Spalten ab 1100px; Abstand 12px.
- Innenabstand Karte: 22px (Camp-Karte), 24px (normal), 16px (kompakt).

## 4. Hero
1. Füllt den Viewport: `min-height: 100svh` (Fallback `100vh`), nie feste Höhe, Inhalt wächst statt abzuschneiden; `padding-top` ≥ Navigationshöhe + 24px.
2. Foto full-bleed `object-fit: cover`; `object-position` so, dass Gesichter oberhalb der Textzone liegen (Richtwert `center 25%`); Ken-Burns 1.08 → 1.0 über 14 s nur beim Laden.
3. Textzone unten links: Label → Headline → ein Satz (max. 42ch, Deckung .85) → zwei Pills („Camps ansehen“ Glas, „Jetzt anmelden“ solid). Verlauf unter der Textzone: `linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.35) 40%, transparent 60%)`; mobil `.85 0% → transparent 70%`.
4. Kennzahlen als eine Glas-Leiste (max. 3 Zahlen: Camps · Alter · Plätze) unten rechts, mobil unter den Buttons. Kein weiterer Text im Hero.
5. Navigation als Glas-Pill (`position: absolute; top: 18px`, max. 1120px): links Logo + Vereinsname, rechts ein solider Pill-Button. Mobil nur Logo + Button.
6. Ohne Foto: Verlauf in Theme-Farben, gleiche Komposition. Niemals Inhalte eines anderen Vereins.

## 5. Komponenten-Rezepte
- **Glas** (dunkle Themes): `background: rgba(255,255,255,.06); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.12); box-shadow: inset 0 1px 1px rgba(255,255,255,.18)`. Helle Themes: `background: var(--surface); border: 1px solid var(--line-2)` – kein Glas auf hellem Grund.
- **Pill-Button**: `border-radius: 9999px; padding: 12px 22px; font-weight: 600`; solid = Weiß auf Dunkel (bzw. `--brand-strong` auf Hell), Glas = Glas-Rezept; Hover `scale(1.03)`, Fokusring 2px sichtbar.
- **Camp-Karte**: 24px Radius, Glas/Weiß, Padding 22px, Datum als große Ziffer (`clamp(2rem, 2.6vw, 2.6rem)`) oben rechts, Titel 20px, max. 2 Chips, max. 3 Leistungen + „+N weitere", Preis + Pill-CTA unten. Hover `translateY(-4px)` + Datumsziffer in `--brand-strong`.
- **Abschnittskopf**: Label (13px, Großbuchstaben) über h2; darunter optional ein Satz.
- **Trainer**: Glas-/Weiß-Karte, Porträt rund 120px (96px mobil), Name 15/600, Text 14–15px; Höhe ≤ 200px.
- **Schritte („So einfach geht's“)**: drei Karten im gleichen Rezept, Ziffer als große Zahl (40px, Deckung .5) statt Kreis-Badge.
- **FAQ**: eine Glas-/Weiß-Fläche, Fragen 15/600 mit 1px Trennlinie, Chevron rechts, offen = Antwort 15px Deckung .8.

## 6. Bewegung (motion.ts, GSAP vorhanden)
- Reveal beim Scrollen: y 18px → 0, Deckung 0 → 1, 0,6 s, Easing `expo.out` (≈ cubic-bezier(0.16,1,0.3,1)), Stagger 120 ms innerhalb einer Gruppe, einmalig.
- Hero beim Laden: Label → Headline → Satz → Buttons → Leiste, je 120 ms versetzt.
- Hover: 0,25 s; Fokus sofort.
- Sicherheitsnetz: nach 1,5 s alles sichtbar. SSR: keine `opacity:0` als Inline-Style (Test m1motion).

## 7. Themes
| | akademie (JK) | tradition | kompakt |
|---|---|---|---|
| Grund | Schwarz/Dunkelgrün, Glas | hell, Vereinsfarbe als Band | hell, neutral |
| Karten | Glas 28px | Weiß + Linie, 5px | Weiß + Linie, 0px |
| Hero | Foto full-bleed + Verlauf | Foto als Fläche, Band in Vereinsfarbe | Text-Hero |
| Buttons | Weiß solid / Glas | `--brand-strong` solid / Linie | wie tradition |
Alle Themes teilen Typografie-Skala, Abstände, Label+Überschrift, Pill-Buttons, Bewegungswerte.

## 8. Prüfliste für den Judge (Screenshots 1440×900 und 390×844)
- Hero: nichts hinter der Navigation, Headline ≤ 5 Zeilen, Text lesbar über Verlauf, kein horizontaler Überlauf mobil.
- Erster Viewport: Bild + Label + Headline + Satz + 2 Pills + Leiste – sonst nichts.
- Abschnitte: Label über jeder h2, 128px Abstand Desktop, Karten-Radien aus der Familie.
- Keine Template-Signale (Abschnitt 1.8).
- Tests grün, tsc 0, 0 pageerrors, reduced-motion respektiert.
