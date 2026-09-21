# Implementierungspaket — JK Performance Academy, Redesign Richtung B

> **Status:** Design freigegeben (Serkan, 21.09.2026). Content-Platzhalter bleiben vorerst bestehen.
> **Designreferenz:** Claude-Design-Canvas „JK Performance Academy – Design B" mit fünf Artboards
> (Startseite Desktop 1440, Startseite Mobil 390, Design Tokens, Interaktionszustände,
> Abschnitte & offene Punkte).
> **Dieses Dokument ist für die Umsetzung durch Claude Code gedacht.** Es beschreibt den Zielzustand,
> nicht den Weg dorthin — die Ticketaufteilung entscheidet Serkan.

---

## 0. Grenzen dieser Umsetzung

Diese Punkte sind nicht verhandelbar und müssen vor jedem Commit geprüft werden:

1. **KSV Baunatal läuft in Produktion.** Jede Änderung an `frontend/app/page.tsx` trifft KSV
   unmittelbar. Kein Schritt dieses Pakets darf die KSV-Startseite visuell oder funktional verändern,
   solange KSV nicht selbst umgestellt wird.
2. **Nichts committen ohne Bestätigung** (CLAUDE.md, Commit-Disziplin). Ein Thema, ein Commit.
3. **Keine Inhalte erfinden.** Alle mit `[CONTENT BENÖTIGT]` markierten Stellen bleiben als sichtbarer
   Platzhalter im Code, bis Serkan die Angaben liefert. Kein Lorem Ipsum, keine erfundenen
   Testimonials, Lizenzen, Partnervereine oder Zahlen.
4. **Bestehende Originalfotos nicht ersetzen.** Die Fotos unter `frontend/public/jk/` sind echte
   Aufnahmen echter Spieler und des Trainers. Keine KI-generierten Personen.
5. **Das Logo nicht verändern.** `frontend/public/jk/logo.jpg` wird unverändert eingebunden.

---

## 1. Die eigentliche Aufgabe: Komponenten statt Verzweigungen

Der Ist-Zustand ist der Hauptblocker, nicht das Aussehen.

**Heute:** `frontend/app/page.tsx` ist ein Monolith von rund 770 Zeilen, der KSV und JK gemeinsam
rendert. Darin stehen:

- `hasPrograms`-Verzweigungen, die entscheiden, welche Sektion ein Mandant sieht
- hartkodierte mandantenspezifische Bildpfade: `/jk/camp.jpg`, `/jk/team.jpg`, `/jk/training.jpg`
- hartkodierte mandantenspezifische Überschriften, unter anderem „Warum JK?"
- genau **eine** Design-Variable: `--brand-accent`. Alles andere (Flächen, Radien, Typo-Skala,
  Abstände) steckt als Tailwind-Klassen fest im Markup.

Kunde drei würde in dieser Struktur einen dritten Verzweigungszweig in derselben Datei bedeuten.

**Ziel:** Die Startseite eines Mandanten ist eine **Liste von Sektionskomponenten**, die aus seiner
Konfiguration gefüllt werden. Kein `if (isJK)` im geteilten Renderer.

```
frontend/app/
├── page.tsx                      ← rendert nur noch: SECTION_ORDER.map(renderSection)
├── sections/
│   ├── SiteHeader.tsx
│   ├── Hero.tsx
│   ├── TrustBar.tsx
│   ├── CoreOffers.tsx
│   ├── CampList.tsx
│   ├── WhyUs.tsx
│   ├── CoachProfile.tsx
│   ├── DevelopmentProcess.tsx
│   ├── SecondaryOffers.tsx
│   ├── InquirySection.tsx
│   ├── Faq.tsx
│   ├── ClosingCta.tsx
│   └── SiteFooter.tsx
└── lib/
    ├── clubConfig.ts             ← Typen + Defaults (KSV)
    ├── clubConfig.jk.tsx         ← JK-Overrides (bestehend, wird erweitert)
    └── tokens.ts                 ← Token-Typ + Mandanten-Tokensets
```

**Migrationsreihenfolge, die KSV nicht bricht:**

1. Sektionskomponenten anlegen und die **KSV-Darstellung 1:1** aus `page.tsx` hineinziehen.
   Danach muss KSV pixelgleich aussehen wie vorher. Das ist der Sicherheitsanker.
2. Token-Set als CSS-Variablen einführen, KSV-Werte so setzen, dass sich optisch nichts ändert.
3. Erst danach die JK-Variante nach diesem Dokument umsetzen.
4. KSV auf Richtung B umstellen ist ein **eigenes, später zu entscheidendes Ticket** — nicht Teil
   dieses Pakets.

---

## 2. Finale Seitenstruktur

Reihenfolge der Startseite. `inverse` = `--surface-inverse`, `panel` = `--surface-panel`,
`base` = `--surface-base`.

| # | Sektion | Komponente | Fläche | Aufgabe |
|---|---|---|---|---|
| 01 | Header | `SiteHeader` | inverse | Marke, 4 Links, eine CTA |
| 02 | Hero | `Hero` | Foto + Verlauf | Angebot, Region, Zielgruppe in fünf Sekunden |
| 03 | Vertrauensleiste | `TrustBar` | panel | Belegbare Partner, keine Kennzahlen |
| 04 | Kernangebote | `CoreOffers` | inverse | Drei Felder 01–03, bewusst keine Karten |
| 05 | Aktuelle Camps | `CampList` | base (Flächenbruch) | Konversionskern |
| 06 | Warum JK | `WhyUs` | inverse + Foto | Abgrenzung zum Vereinstraining |
| 07 | Trainerprofil | `CoachProfile` | panel + Portrait | Person statt Institution |
| 08 | Entwicklungsprozess | `DevelopmentProcess` | inverse | Platzhalter bis echte Stimmen vorliegen |
| 09 | Weitere Formate | `SecondaryOffers` | base | 5 Freunde, Messday, Spieleranalyse — nachrangig |
| 10 | Anfrage + Ablauf | `InquirySection` | inverse | Formular links, Ablauf-Sidebar rechts |
| 11 | FAQ | `Faq` | base | Zweispaltig, offen statt Akkordeon |
| 12 | Abschluss-CTA | `ClosingCta` | panel | Letzte Gelegenheit zur Anfrage |
| 13 | Footer | `SiteFooter` | inverse | Kontakt, Instagram, Datenschutz, Impressum |

Der Flächenwechsel zwischen 04 (dunkel) und 05 (hell) ist **gestalterische Absicht**: Der harte
Bruch gibt dem Camp-Bereich Aufmerksamkeit, ohne dass er sie über Farbe erkaufen muss. Er darf
nicht weggeglättet werden.

---

## 3. Design Tokens

Als CSS-Variablen auf dem Wurzelelement setzen, nicht als Tailwind-Klassen festschreiben.

### 3.1 Mandantentokens — pro Kunde gesetzt

| Token | JK Performance | KSV Baunatal | Rolle |
|---|---|---|---|
| `--accent` | `#B8912B` | `#CC0000` | Primärbutton, Linien, Ziffern |
| `--on-accent` | `#0B0F1A` | `#FFFFFF` | Schrift auf Akzentfläche |
| `--accent-quiet` | `#D9B14A` | `#FF6B6B` | Akzenttext auf dunkler Fläche |
| `--accent-ink` | `#8A6A16` | `#A80000` | Akzenttext auf heller Fläche |
| `--surface-base` | `#F7F4EE` (warm) | `#F6F6F7` (kühl) | Helle Sektionen |
| `--logo-src` | `/jk/logo.jpg` | `/logo.svg` | Header und Footer |

**Warum vier Akzentwerte statt einem:** Gold trägt dunkle Schrift, Rot braucht weiße — ein einzelnes
Akzent-Token reißt bei KSV die Kontrastprüfung. Ebenso brauchen Akzentlabels auf heller und dunkler
Fläche getrennte Werte, sonst fällt Gold auf Cremeweiß unter 4,5:1. `--on-accent` wird **immer**
zusammen mit `--accent` gesetzt.

Das warme Off-White wird für KSV eine Spur kühler, weil Rot auf warmem Creme ziegelartig wirkt.

### 3.2 Produkttokens — für alle Mandanten gleich

```css
/* Flächen und Linien */
--surface-inverse: #0B0F1A;
--surface-panel:   #141A28;
--surface-card:    #FFFFFF;
--line-dark:       #263047;
--line-light:      #DED8CC;

/* Schriftfarben (Kontrast gegen die jeweilige Trägerfläche) */
--text-on-dark:        #FFFFFF;  /* 18,4:1 auf --surface-inverse */
--text-on-dark-muted:  #C9CED8;  /* 11,8:1 */
--text-on-light:       #11151F;  /* 16,1:1 auf --surface-base */
--text-on-light-muted: #4A5261;  /*  6,9:1 */
--text-quiet:          #9AA3B2;  /*  6,4:1 */

/* Abstände — 8px-Raster */
--space-1: 8px;   --space-2: 16px;  --space-3: 24px;
--space-4: 32px;  --space-5: 48px;  --space-6: 64px;
--space-section: 88px;   /* Mobil: 44px */
--gutter: 120px;         /* Mobil: 20px */
--content-max: 1200px;

/* Radien, Rahmen, Schatten */
--radius-card: 4px;      /* bewusst kantig */
--radius-pill: 999px;    /* ausschließlich Buttons */
--border: 1px;
--border-accent: 2px;
/* Schatten: keiner. Tiefe entsteht aus Fläche und Linie. */
```

### 3.3 Typografie

| Rolle | Familie | Gewicht | Desktop | Mobil |
|---|---|---|---|---|
| H1 | Barlow Condensed | 700 | 82px / 0,94 | 44px / 0,96 |
| H2 | Barlow Condensed | 700 | 52px / 1,0 | 34px / 1,0 |
| H3 | Barlow Condensed | 600 | 30px | 24px |
| Lead | Barlow | 400 | 19px / 1,55 | 16px / 1,55 |
| Body | Barlow | 400 | 16px / 1,65 | 15px / 1,6 |
| Small | Barlow | 400 | 14px | 14px |
| Caption | Barlow | 400 | 13px | 12px |
| Label | Barlow | 600 | 12px, `letter-spacing: 0.2em`, Versalien | gleich |

H1, H2, H3 und Labels laufen in Versalien. Fließtext nie.

---

## 4. Komponentenliste

Alle Sektionen sind reine Präsentationskomponenten und bekommen ihre Daten als Props aus der
Mandantenkonfiguration. Keine Komponente liest `NEXT_PUBLIC_ACTIVE_CLUB` selbst.

| Komponente | Props (Auszug) | Anmerkung |
|---|---|---|
| `SiteHeader` | `brandName`, `logoSrc`, `navItems[]`, `ctaLabel`, `ctaHref` | Sticky ab Scroll > 0 |
| `Hero` | `eyebrow`, `headline`, `subline`, `imageSrc`, `imageAlt`, `primaryCta`, `secondaryCta`, `footnote` | Verlauf als eigene Ebene über dem Bild |
| `TrustBar` | `label`, `partners[]`, `pendingNote?` | `pendingNote` rendert das Content-Platzhalterfeld |
| `CoreOffers` | `eyebrow`, `headline`, `intro`, `offers[{ number, title, text }]` | Drei Felder mit Trennlinien, **keine Karten** |
| `CampList` | `eyebrow`, `headline`, `meta`, `camps[]` | `camps[]` kommt später aus der DB, nicht aus der Konfigurationsdatei |
| `WhyUs` | `eyebrow`, `headline`, `imageSrc`, `imageAlt`, `points[{ title, text }]` | Bild links, Punkte rechts |
| `CoachProfile` | `eyebrow`, `name`, `intro`, `portraitSrc`, `portraitAlt`, `pendingFields[]` | `pendingFields[]` rendert die Platzhalterfelder |
| `DevelopmentProcess` | `eyebrow`, `headline`, `intro`, `steps[]`, `pendingNote` | Entfällt, sobald echte Stimmen vorliegen |
| `SecondaryOffers` | `eyebrow`, `headline`, `intro`, `offers[]` | Visuell klar leiser als `CoreOffers` |
| `InquirySection` | `headline`, `fields`, `processSteps[]`, `directContact?` | Enthält das echte Formular, siehe Abschnitt 8 |
| `Faq` | `eyebrow`, `headline`, `items[{ q, a }]` | Zweispaltig, alle Antworten offen |
| `ClosingCta` | `headline`, `text`, `ctaLabel`, `ctaHref` | |
| `SiteFooter` | `brandName`, `logoSrc`, `description`, `contact`, `legalLinks[]` | |

**Gemeinsame Bausteine:** `Button` (Varianten `primary`, `ghost`, `text`), `Badge`,
`ContentPlaceholder` (das gestrichelte Akzentfeld), `SectionHeading` (Eyebrow + H2), `CheckItem`
(Icon + Text, **niemals Emoji**).

> Die grünen Emoji-Häkchen (✅), die aktuell in den Camp-, Mitgliedschafts- und KSV-Sidebar-Karten
> stehen, werden durchgängig durch das `CheckItem`-SVG in `--accent-ink` ersetzt. Das betrifft auch
> KSV und ist dort eine reine Ersetzung ohne Layoutänderung.

---

## 5. Responsive-Regeln

| Breakpoint | Verhalten |
|---|---|
| ≥ 1280px | Wie Desktop-Artboard. Gutter 120, Inhalt max. 1200. Kernangebote 3 Spalten, Camps 2, FAQ 2, Anfrage 2 Spalten mit Sidebar. |
| 1024–1279px | Gutter 64. Hero-Verlauf steiler. Ablauf-Sidebar rutscht unter das Formular. |
| 768–1023px | Kernangebote 1 Spalte mit Trennlinien statt Spaltenrändern. Camps 1 Spalte. Warum-JK-Bild über den Text. Navigation wird Burger. |
| < 768px | Wie Mobil-Artboard. Gutter 20, H1 44, Sektionsabstand 44. Hero-Verlauf von oben, Text unten. Sticky CTA-Leiste. |

**Sticky CTA-Leiste (nur < 768px):** erscheint erst, wenn der Hero aus dem Blickfeld gescrollt ist,
und verschwindet, sobald `InquirySection` im Viewport ist — sonst verdeckt sie den Absenden-Button.

---

## 6. Interaktionszustände

**Primärbutton**

| Zustand | Umsetzung |
|---|---|
| Default | `--accent`, Höhe 54px, Radius 999px |
| Hover | Helligkeit +8 % (`#D4A93A` bei JK) |
| Active | Helligkeit −10 % (`#9A7822`), **kein** Positionsversatz |
| Focus-visible | 3px Outline `--text-on-dark`, 3px Offset |
| Disabled | `#3A4152` mit `#7D8598`, kein Akzent |

**Formularfeld**

| Zustand | Umsetzung |
|---|---|
| Default | Rahmen `--line-dark`, Fläche `--surface-panel` |
| Fokus | Rahmen `--accent` + 2px Outline in `--accent` bei 35 % |
| Fehler | Rahmen `#FF8A8A` **plus** Icon **plus** Text unter dem Feld |
| Disabled | Fläche `#10151F`, Text `#6B7488` |

Fehler werden nie allein über Farbe angezeigt. Fehlermeldungen stehen unter dem Feld, nie als Tooltip.

**Campkarte:** Default 1px `--line-light` mit 8px Akzentkante oben. Hover nur Rahmenwechsel auf
`#B9AF9B` — keine Bewegung, kein Anheben. Ausgebucht: Akzentkante grau, Button disabled, Badge
„Ausgebucht" ersetzt „Begrenzte Plätze".

**Navigation:** Default `--text-on-dark-muted`, Hover `--text-on-dark` plus 2px Akzentlinie darunter,
Aktiv dieselbe Linie dauerhaft.

---

## 7. Accessibility-Anforderungen

- Tastaturbedienung vollständig, sichtbarer Fokus auf **allen** Bedienelementen
- Touch-Ziele mindestens 44 × 44px, auch das Burger-Menü
- Fokusreihenfolge folgt der Leserichtung, keine Tabfallen
- `prefers-reduced-motion` respektieren: keine Parallax, keine automatischen Slides
- Jedes Feld hat ein echtes `<label>`; ein Platzhalter ersetzt kein Label
- Fehler werden per `aria-live="polite"` angesagt, nicht nur eingefärbt
- Icon-Buttons tragen `aria-label`
- Die Heroüberschrift ist die einzige `<h1>` der Seite
- Skip-Link „Zum Inhalt springen", sichtbar beim ersten Tab
- Alle Kontrastwerte aus Abschnitt 3.2 sind gegen ihre Trägerfläche geprüft und erfüllen WCAG AA

---

## 8. Funktionaler Anfragefluss (CP-JK-101)

**Heute gibt es kein Formular.** „Trainingsanfrage stellen" und „Interesse an Mitgliedschaft" sind
`mailto:`-Links ohne API-Aufruf. Der einzige Backend-Kontakt von JK aus ist der lesende
`GET /config` gegen den isolierten JK-Service. Das ist der größte funktionale Blocker der Seite.

**Zielzustand:**

```
Browser → POST /inquiries (JK-eigener Render-Service)
             ↓ Validierung (Pydantic v2)
             ↓ psycopg2 → JK-eigenes Supabase-Projekt
             ↓ Benachrichtigungsmail an JK  [CONTENT BENÖTIGT: Zieladresse]
          201 Created → Bestätigungsansicht im Frontend
```

**Formularfelder**

| Feld | Typ | Pflicht | Hinweis |
|---|---|---|---|
| Name des Spielers | Text | ja | |
| Jahrgang | Text | ja | Vierstellig, plausibilisieren |
| Worum geht es? | Select | ja | Individualtraining · Kleingruppentraining · Camp FSK Vollmarshausen · Camp TSV Wolfsanger · 5 Freunde / Messday / Spieleranalyse |
| E-Mail der Eltern | E-Mail | ja | Zieladresse der Rückmeldung |
| Nachricht | Textarea | nein | |

**Datenschutz:** Es werden Daten Minderjähriger verarbeitet (DSGVO Art. 9 ist im Projekt als kritisch
markiert). Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO wird unter dem Formular genannt.
Row Level Security analog zum KSV-Schema: öffentliches `INSERT`, `SELECT`/`UPDATE` nur über den
Service-Role-Key. Kein Browser-Direktzugriff auf Daten.

**Reihenfolge:** Das Formular kann und soll **vor** der visuellen Umstellung gebaut werden. Ein
schönes Design auf einem toten Anfrageweg bringt keine Anfrage.

---

## 9. Assets

| Datei | Verwendung | Anmerkung |
|---|---|---|
| `public/jk/hero.jpg` | Hero | Mannschaftsfoto mit Trainer, Querformat |
| `public/jk/team.jpg` | Warum JK | Trainingsgruppe |
| `public/jk/training.jpg` | Trainerprofil | **Portrait des Trainers**, Hochformat — trotz Dateiname keine Trainingsszene |
| `public/jk/camp.jpg` | frei / Reserve | Trainer mit Ball |
| `public/jk/logo.jpg` | Header, Footer | Wappen auf schwarzem Grund |

**Zum Logo:** Es liegt auf Schwarz. Auf der heutigen hellen Seite braucht es dafür einen dunklen
Chip (`logoChipColor: '#0F172A'`), damit der Hintergrund nicht wie ein Bildfehler wirkt. In Richtung
B sind Header und Footer ohnehin dunkel — **der Chip entfällt ersatzlos.** Das ist ein Nebeneffekt
der Richtung, kein Zufall.

Alle Bilder brauchen `next/image` mit sinnvollen `sizes`, beschreibende `alt`-Texte (dekorative
Bilder `alt=""`) und das Heromotiv `priority`.

Die 20 Originalaufnahmen unter `JK-Bilder/` stehen für weitere Motive zur Verfügung.

---

## 10. Finale Copy

Belegte Inhalte stammen von der Live-Seite und aus `clubConfig.jk.tsx`. Alles andere ist markiert.

**Hero**
- Eyebrow: `REGION KASSEL`
- H1: `Individuelles Fußballtraining für ambitionierte Spieler`
- Subline: `Technik, Spielverständnis und persönliche Entwicklung — ergänzend zu deinem Vereinstraining.`
- Primär: `Training anfragen` · Sekundär: `Aktuelle Camps ansehen`
- Fußnote: `Für Spielerinnen und Spieler · Einzel, Kleingruppe und Team · Training in deiner Region`

**Vertrauensleiste**
- Label: `UNSERE PARTNERVEREINE` — `FSK Vollmarshausen` · `TSV Wolfsanger`
- `[CONTENT BENÖTIGT: Trainerlizenz / Qualifikation]`

**Kernangebote** — Eyebrow `WAS WIR ANBIETEN`, H2 `Drei Wege, besser zu werden`,
Intro `Jedes Format ergänzt dein Vereinstraining — es ersetzt es nicht.`

- **01 Individualtraining** — „Einzeltraining mit klarem Fokus: Technik, Abschluss, Beidfüßigkeit, Handlungsschnelligkeit. Du bekommst nach jeder Einheit persönliches Feedback."
- **02 Kleingruppentraining** — „Kleine Gruppen mit ähnlichem Niveau. Echte Spielsituationen, hohe Wiederholungszahl — und trotzdem sieht der Trainer jeden Ball."
- **03 Camps & Events** — „Dreitägige Feriencamps bei unseren Partnervereinen. Stationstraining, Wettbewerbe, Videoanalyse und Verpflegung vor Ort."

**Aktuelle Camps** — Eyebrow `JETZT BUCHBAR`, H2 `Aktuelle Camps 2026`,
Meta `Beide Camps: 6–14 Jahre · 9–15 Uhr · begrenzte Plätze`

| | Camp 1 | Camp 2 |
|---|---|---|
| Titel | Sommercamp bei FSK Vollmarshausen | Sommercamp bei TSV Wolfsanger |
| Zeitraum | Mi 08.07. – Fr 10.07.2026 · 9–15 Uhr | Mi 29.07. – Fr 31.07.2026 · 9–15 Uhr |
| Ort | Sportgelände FSK Vollmarshausen · 2. Ferienwoche | Sportgelände TSV Wolfsanger · 5. Ferienwoche |
| Alter | 6–14 Jahre | 6–14 Jahre |
| Preis | 149 € Mitglieder des Partnervereins · 169 € extern | identisch |

Leistungen (beide Camps, unverändert übernommen): Stationstraining · Wettbewerbe, Events und
Turniere · Techniktraining & Individualtraining · Spieleranalyse und Videoanalyse · Mittagessen,
Getränke und Verpflegung vor Ort

**Warum JK** — H2 `Was ein Vereinstraining selten leisten kann`
- Individuelle Förderung — „Wir arbeiten an deinen Themen — nicht am Durchschnitt der Mannschaft."
- Kleine Gruppen — „Mehr Ballkontakte pro Einheit und ein Trainer, der jeden Fehler sieht."
- Persönliches Feedback — „Nach jeder Einheit weißt du, woran du bis zum nächsten Mal arbeitest."
- Ergänzung, kein Ersatz — „Dein Verein bleibt dein Zuhause. Wir arbeiten an dem, wofür dort die Zeit fehlt."

**Trainerprofil** — Eyebrow `DEIN TRAINER`, Name `Jan [CONTENT BENÖTIGT: Nachname]`
- Intro: „Gründer der JK Performance Academy. Er trainiert jede Einheit selbst — deshalb kennt er jeden Spieler, den er betreut, persönlich."
- `[CONTENT BENÖTIGT: Trainerlizenz (z. B. DFB B-Lizenz), Jahre Erfahrung, bisherige Stationen]`
- `[CONTENT BENÖTIGT: Trainingsphilosophie in zwei bis drei Sätzen, von Jan selbst formuliert]`

**Entwicklungsprozess** — H2 `Entwicklung ist ein Prozess, kein Versprechen`,
Intro „Wir versprechen keine Karrieren. Wir zeigen, wie wir arbeiten — und du entscheidest, ob das zu dir passt."
Schritte: Standort bestimmen · Ziele festlegen · Wiederholen · Überprüfen

**Weitere Formate** — 5 Freunde (6–10 Spieler), Messday (6–10 Spieler), Spieleranalyse (1 Spieler),
jeweils mit „Angebot anfragen" als Textlink, nie als Primärbutton.

**FAQ** — sechs Fragen: Ersetzt das Training meinen Verein? · Für welches Alter? · Was ist „5 Freunde"? ·
Was ist ein Messday? · Wo findet das Training statt? · Kann ich Mitglied werden?

**Abschluss-CTA** — `Bereit für den nächsten Schritt?` / „Eine Anfrage kostet dich zwei Minuten — und
verpflichtet zu nichts."

**Footer** — `[CONTENT BENÖTIGT: E-Mail, Telefon, Instagram]`, Datenschutzerklärung, Impressum

---

## 11. Was entfernt oder ausgeblendet wird

| Element | Entscheidung | Begründung |
|---|---|---|
| Mitgliedschafts-Sektion | Von der Startseite entfernen | Es existiert keine funktionierende Warteliste. Ein „in Vorbereitung"-Block darf nicht mit der Hauptkonversion konkurrieren. Bleibt als FAQ-Antwort. |
| Bildergalerie / Karussell | Ersatzlos streichen | Bildschirmfüllend direkt nach dem Hero, unterbricht den Fluss genau dort, wo das Angebot stehen muss. Fotos wandern auf Hero, Warum JK, Trainerprofil. |
| Kennzahlenzeile im Hero | Ersatzlos streichen | „5 Programme · 2 Camps · Flexibel · Region Kassel" zählt Inventar, nicht Kompetenz. Ersetzt durch die Partnervereins-Leiste. |
| Dritte Hero-CTA | Streichen | Drei gleichrangige Buttons = keine Priorität. Eine primäre, eine sekundäre Aktion. |
| Grüne Emoji-Häkchen | Durch `CheckItem`-SVG ersetzen | Systemfremd, brechen Gold/Navy. Betrifft auch KSV. |
| Unscharfer Foto-Hintergrund der Camp-Sektion | Streichen | Text auf unruhiger Fläche, Kontrast leidet. Ersetzt durch die ruhige helle Fläche. |
| `logoChipColor` | Entfällt bei Richtung B | Header und Footer sind dunkel, das Wappen sitzt ohne Hilfskonstruktion. |

---

## 12. Acceptance Criteria

**Struktur**
- [ ] `page.tsx` enthält keine mandantenspezifischen Bildpfade und keine mandantenspezifischen Überschriften mehr
- [ ] `page.tsx` enthält keine `if`-Verzweigung auf einen konkreten Mandanten
- [ ] Jede der 13 Sektionen ist eine eigene Komponente mit Props
- [ ] Die Sektionsreihenfolge kommt aus der Mandantenkonfiguration

**Mandantenfähigkeit**
- [ ] Alle Tokens aus Abschnitt 3 existieren als CSS-Variablen
- [ ] Ein Wechsel von `--accent`/`--on-accent` auf die KSV-Werte verändert ausschließlich Farben — Struktur, Typografie und Abstände bleiben identisch
- [ ] Ein neuer Mandant braucht keine Änderung an einer Sektionskomponente

**KSV-Schutz**
- [ ] Die KSV-Startseite ist nach Schritt 1 und 2 der Migration visuell unverändert
- [ ] Der KSV-Anmeldeflow funktioniert unverändert: Formular, Stripe-Checkout, Webhook, Admin-Dashboard
- [ ] Keine Migration gegen die KSV-Tabelle `camp_registrations`

**Funktion**
- [ ] `POST /inquiries` existiert, validiert und schreibt in das JK-eigene Supabase-Projekt
- [ ] Das Anfrageformular sendet echte Daten, kein `mailto:`
- [ ] Erfolgs- und Fehlerfall haben je eine sichtbare Rückmeldung
- [ ] Doppeltes Absenden ist verhindert

**Design**
- [ ] Desktop bei 1440px entspricht dem Artboard „Startseite Desktop 1440"
- [ ] Mobil bei 390px entspricht dem Artboard „Startseite Mobil 390"
- [ ] Alle Interaktionszustände aus Abschnitt 6 sind umgesetzt
- [ ] Kein Schatten, keine identischen weißen Karten in Folge, kein Karussell
- [ ] Kein Emoji im Markup

**Zugänglichkeit**
- [ ] Die Seite ist vollständig per Tastatur bedienbar, Fokus überall sichtbar
- [ ] Alle Textkontraste erfüllen WCAG AA
- [ ] Touch-Ziele ≥ 44 × 44px
- [ ] `prefers-reduced-motion` wird respektiert
- [ ] Genau eine `<h1>` pro Seite

**Inhalt**
- [ ] Jede `[CONTENT BENÖTIGT]`-Stelle ist im UI sichtbar markiert, nicht mit Erfundenem gefüllt
- [ ] Es steht keine unbelegte Zahl, Qualifikation oder Referenz auf der Seite
- [ ] Die Seite geht nicht live, solange Impressum, Kontaktweg und Trainerangaben fehlen

---

## 13. Offene Entscheidungen für Serkan

1. **Jans Angaben und Kontaktwege** — bleiben vorerst Platzhalter (bestätigt am 21.09.2026).
2. **Wird KSV ebenfalls auf Richtung B umgestellt?** Dieses Paket bereitet es vor, entscheidet es
   aber nicht. Solange KSV beim heutigen Aussehen bleibt, teilen sich beide Mandanten die
   Komponenten, nicht die Gestaltung.
3. **Reihenfolge:** Empfehlung ist Anfrageformular (Abschnitt 8) vor dem visuellen Redesign.
4. **Altersgrenzen-Inkonsistenz (T01 in TODO.md)** bleibt offen: Frontend erlaubt max. 12 Jahre,
   das DB-Schema bis 18, die JK-Camps laufen bis 14. Das ist unabhängig vom Design zu klären.
