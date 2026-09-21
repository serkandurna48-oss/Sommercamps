// JK Performance Academy — Draft-Overrides (CP-S308-light).
//
// Interner Vorschau-Branch, aktiviert nur lokal via NEXT_PUBLIC_ACTIVE_CLUB=jk.
// logoSrc/heroImageSrc sind echte, von Serkan bereitgestellte Assets
// (frontend/public/jk/logo.jpg, hero.jpg). Positionierungstexte (Tagline,
// Training/Camps/Kooperationen, die 3 Programme) sind echte, von Serkan
// gelieferte Copy — nur Kontakt/Standort sind noch PLATZHALTER ("[…]").
//
// Diese Vorschau ist rein visuell: es gibt kein echtes Anfrageformular.
// Der reale Trainingsanfrage-Flow ist als Folge-Ticket CP-JK-101
// ("Training Inquiry Flow") vorgesehen — siehe page.tsx Formular-Fallback.

import type { CampEntry, ClubIdentity, FaqEntry, HighlightEntry, MediaEntry, ProgramEntry } from './clubConfig'

export const JK_OVERRIDES: {
  CLUB_CONFIG: ClubIdentity
  CAMPS: CampEntry[]
  PROGRAMS: ProgramEntry[]
  HIGHLIGHTS: HighlightEntry[]
  JERSEY_SIZES: string[]
  INCLUDED_ITEMS: string[]
  FAQ_ITEMS: FaqEntry[]
  VENUE_INFO_TEXT: string | null
  FIRST_TEAM_INFO_TEXT: string | null
  MEMBERSHIP_BENEFITS: string[]
  SLIDESHOW_ITEMS: MediaEntry[]
} = {
  CLUB_CONFIG: {
    name: 'JK Performance Academy',
    subtitle: 'Talententwicklung',
    contactName: 'JK Performance Academy',
    // Platzhalter-Domain — echte Adresse folgt; bleibt nur als mailto-Ziel für die
    // eine erlaubte Kontakt-CTA (Mitgliedschaft) im Hintergrund, wird nirgends mehr
    // als sichtbarer Text angezeigt (siehe page.tsx).
    contactEmail: 'platzhalter@jk-performance-academy.example',
    contactPhone: 'Telefon auf Anfrage',
    venueName: 'Region Kassel',
    logoSrc: '/jk/logo.jpg',
    heroImageSrc: '/jk/hero.jpg',
    // Aus dem JK-Logo abgeleitet (Wappen: Gold/Bronze auf Dunkelgrün/Schwarz) —
    // bewusst zurückhaltend statt neongelb. Siehe clubConfig.tsx für den
    // CSS-Variable-Mechanismus, der das ohne dynamische Tailwind-Klassen umsetzt.
    accentColor: '#B8912B',
    heroTagline: 'DU willst DICH weiterentwickeln, wir bringen DICH auf DEIN nächstes Level.',
    // logo.jpg ist auf den Wappen-Ausschnitt zugeschnitten (kein Wortmarke/Bälle mehr),
    // hat aber weiterhin einen schwarzen Hintergrund — auf Weiß wirkt das hart.
    // Ein dunkler Chip macht den schwarzen Hintergrund zu einem bewussten Badge statt
    // einem Bildfehler; passt zur navy/gold-Flyer-Optik.
    logoChipColor: '#0F172A',

    // Sektionsspezifische Werte (CP-JK-103). Diese Pfade und Überschriften
    // standen bis dahin direkt in page.tsx — in der Datei, die auch KSV in
    // Produktion rendert. Sie gehören hierher, weil sie ausschließlich JK
    // betreffen.
    campsBackgroundSrc: '/jk/camp.jpg',
    whyUsEyebrow: 'Warum JK?',
    whyUsHeading: 'Für Spieler, die mehr wollen',
    whyUsImageSrc: '/jk/team.jpg',
    // Trotz Dateiname ein Portrait des Trainers, keine Trainingsszene.
    coachPortraitSrc: '/jk/training.jpg',
  },

  // Leer: JK zeigt statt der Termine-Sektion die PROGRAMS-basierte
  // "Events & Programme"-Sektion (siehe page.tsx).
  CAMPS: [],

  // Reale Programme (Stand: Serkan, CP-S308-light Revision 3). Statische
  // Draft-Karten — CP-S302 soll dies in eine editierbare Event-/Camp-
  // Verwaltung (Admin-UI + DB) überführen, ohne dass sich das Rendering in
  // page.tsx grundlegend ändern muss.
  PROGRAMS: [
    {
      category: '5 Freunde',
      title: '5 Freunde',
      description: 'Finde 5 Freunde, die mit dir zusammen trainieren und sich weiterentwickeln wollen. Wir trainieren euch in deiner Region.',
      cadence: 'Auf Anfrage',
      tag: '6–10 Spieler',
    },
    {
      category: 'Messday',
      title: 'Messday',
      description: 'Du willst deine kognitiven Fähigkeiten verbessern und deine Messwerte wissen. Wir kommen in deine Region und testen euch.',
      cadence: 'Auf Anfrage',
      tag: '6–10 Spieler',
    },
    {
      category: 'Spieleranalyse',
      title: 'Spieleranalyse',
      description: 'Du willst deine eigene Spieleranalyse, einen Karriereplan oder ein Mentalcoaching. Wir coachen dich 1:1 und erstellen eine Analyse.',
      cadence: 'Auf Anfrage',
      tag: '1 Spieler',
    },
    // Konkrete, terminierte Sommercamps bei Partnervereinen (nicht bei JK selbst) —
    // deshalb explizit "für Mitglieder des Partnervereins" / "für externe Spieler"
    // statt einer JK-Mitgliedschaft, die es (noch) nicht gibt.
    {
      category: 'Feriencamps',
      title: 'Sommercamp bei FSK Vollmarshausen',
      description: '3 Tage Spielerentwicklung mit unserem Partnerverein FSK Vollmarshausen.',
      cadence: '2. Ferienwoche · Mi 08.07. – Fr 10.07.2026 · 9–15 Uhr',
      tag: '6–14 Jahre',
      benefits: [
        'Stationstraining',
        'Wettbewerbe, Events und Turnier',
        'Techniktraining & Individualtraining',
        'Spieleranalyse und Videoanalyse',
        'Mittagessen, Getränke und Verpflegung vor Ort',
      ],
      priceNote: '149 € für Mitglieder des Partnervereins · 169 € für externe Spieler',
      featured: true,
    },
    {
      category: 'Feriencamps',
      title: 'Sommercamp bei TSV Wolfsanger',
      description: '3 Tage Spielerentwicklung mit unserem Partnerverein TSV Wolfsanger.',
      cadence: '5. Ferienwoche · Mi 29.07. – Fr 31.07.2026 · 9–15 Uhr',
      tag: '8–14 Jahre',
      benefits: [
        'Stationstraining',
        'Wettbewerbe, Events und Turnier',
        'Techniktraining & Individualtraining',
        'Spieleranalyse und Videoanalyse',
        'Mittagessen, Getränke und Verpflegung vor Ort',
      ],
      priceNote: '149 € für Mitglieder des Partnervereins · 169 € für externe Spieler',
      featured: true,
    },
  ],

  // Positionierung (Training / Camps und Events / Kooperationen), reale Copy.
  // Icons wiederverwendet aus der bestehenden Icon-Auswahl (rein dekorativ).
  HIGHLIGHTS: [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      ),
      title: 'Training',
      text: 'Individualtraining, Gruppentraining und Teamtraining. Stelle eine Trainingsanfrage.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      ),
      title: 'Camps und Events',
      text: 'Feriencamps und coole Events mit Fokus auf individueller Spielerentwicklung.',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
        </svg>
      ),
      title: 'Kooperationen',
      text: 'Mit Vereinen und Sponsoren – wir sind offen für neue Entwicklungen und bieten Trainings in verschiedenen Regionen an.',
    },
  ],

  JERSEY_SIZES: ['6XS–5XS (104–116)', '4XS–3XS (128–140)', '2XS (152)', 'XS (164)', 'S', 'M'],

  // Kein "Camp-Paket" mehr (Trikot/Urkunde/Verpflegung) im neuen
  // Positionierungsmodell — die Sidebar-Karte dafür wird in page.tsx
  // ausgeblendet, wenn INCLUDED_ITEMS leer ist.
  INCLUDED_ITEMS: [],

  FAQ_ITEMS: [
    {
      q: 'Wie läuft eine Anfrage ab?',
      a: 'Du stellst uns eine unverbindliche Trainingsanfrage oder fragst ein Angebot an. Wir melden uns anschließend bei dir, um Programm, Region und Termin abzustimmen.',
    },
    {
      q: 'Gibt es aktuell Sommercamps?',
      a: 'Ja – aktuell bei unseren Partnervereinen FSK Vollmarshausen (08.07.–10.07.2026) und TSV Wolfsanger (29.07.–31.07.2026). Die Teilnahme ist sowohl für Vereinsmitglieder des Partnervereins als auch für externe Spieler möglich.',
    },
    {
      q: 'Was ist "5 Freunde"?',
      a: 'Finde 5 Freunde, die mit dir zusammen trainieren und sich weiterentwickeln wollen (6–10 Spieler) – wir trainieren euch in eurer Region.',
    },
    {
      q: 'Was ist ein Messday?',
      a: 'Beim Messday kommen wir in deine Region und testen deine Messwerte und kognitiven Fähigkeiten (6–10 Spieler).',
    },
    {
      q: 'Bietet ihr auch 1:1-Coaching an?',
      a: 'Ja – bei der Spieleranalyse coachen wir dich 1:1 und erstellen eine individuelle Analyse, einen Karriereplan oder Mentalcoaching.',
    },
    {
      q: 'Bietet ihr Trainings auch außerhalb eurer Region an?',
      a: 'Wir kooperieren mit Vereinen und Sponsoren und sind offen für neue Entwicklungen. Sprich uns gerne auf dein Region an.',
    },
    {
      q: 'Kann ich bei JK Mitglied werden?',
      a: 'Eine Mitgliedschaft bei JK Performance Academy ist aktuell in Vorbereitung. Interesse an Mitgliedschaft? Schreib uns – wir melden uns, sobald es so weit ist.',
    },
    {
      q: 'An wen wende ich mich bei Fragen?',
      a: 'Kontakt per Instagram/WhatsApp ist in Vorbereitung. Nutze bis dahin gerne die Trainingsanfrage oder das Interesse-Formular oben auf der Seite.',
    },
  ],

  // Keine eigene Vereinsgeländer-/1.-Mannschaft-Struktur bekannt -> Infoboxen ausblenden
  // statt KSV-spezifischen Text zu übernehmen.
  VENUE_INFO_TEXT: null,
  FIRST_TEAM_INFO_TEXT: null,

  // TODO(jk-content): echte Mitgliedschafts-Vorteile von Jan einholen — aktuell plausible
  // Platzhalter, damit die Mitgliedschaft-Sektion nicht leer wirkt.
  MEMBERSHIP_BENEFITS: [
    'Bevorzugter Zugang zu Camp-Plätzen bei unseren Partnervereinen',
    'Vergünstigte Konditionen für Training und Camps',
    'Eigenes Spielerprofil mit Trainings- und Entwicklungsdokumentation',
    'Direkter Draht zu unseren Trainern für individuelles Feedback',
  ],

  // Nur Bild-Slides zum Start — Video-Slides werden ergänzt, sobald echtes
  // Videomaterial von Jan vorliegt (gleicher MediaEntry-Typ, type: 'video').
  // Der komplette Rohbilder-Pool stammt aus einem einzigen Shooting mit nur 3
  // wirklich unterschiedlichen Motiven (Team, Trainer mit Ball, Trainer-Portrait).
  // Ein zweites Team-Foto (nur Sekunden später, andere Pose) wurde bewusst
  // NICHT mit aufgenommen — wirkte im Slideshow-Kontext wie ein Duplikat statt
  // wie ein eigenständiger Slide. 4 statt 5 Slides, aber jeder eigenständig.
  //
  // TODO(jk-content): Bildrechte/Einwilligungen für die abgebildeten Jugendlichen sind laut
  // jk-client-intake.md noch NICHT bestätigt (gleiche Spieler wie in hero.jpg/team.jpg, die
  // bereits live sind). Vor dem finalen Go-Live mit Jan explizit bestätigen lassen, sonst
  // Slide 1 gegen ein Solo-/Detail-Motiv austauschen.
  SLIDESHOW_ITEMS: [
    { type: 'image', src: '/jk/slideshow/01.jpg', alt: 'JK Performance Academy Team' },
    { type: 'image', src: '/jk/slideshow/02.jpg', alt: 'Trainer JK Performance Academy mit Ball' },
    { type: 'image', src: '/jk/slideshow/03.jpg', alt: 'Trainer JK Performance Academy' },
    { type: 'image', src: '/jk/slideshow/04.jpg', alt: 'JK Performance Academy Trikot' },
  ],
}
