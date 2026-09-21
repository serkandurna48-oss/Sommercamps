// ---------------------------------------------------------------------------
// JK Performance Academy — Seiteninhalt und Sektionsreihenfolge (CP-JK-104).
//
// Die Werte hier sind wortgleich aus der bisherigen PROGRAMS-Fallunterscheidung
// in page.tsx übernommen. Diese Datei ersetzt sie, sie ändert sie nicht.
//
// Achtung beim Redesign nach Richtung B: Laut Designfreigabe entfallen die
// Mitgliedschafts-Sektion, die Slideshow und die Hero-Kennzahlen von der
// Startseite (siehe docs/design/jk-redesign-b-handoff.md, Abschnitt 11). Das
// ist dann eine Änderung an JK_SECTION_ORDER und heroFacts hier — nicht an
// page.tsx und nicht an einer Sektionskomponente.
// ---------------------------------------------------------------------------

import type { SectionId, SiteContent } from './siteContent'

export const JK_SECTION_ORDER: SectionId[] = [
  'slideshow',
  'featuredCamps',
  'otherOffers',
  'whyUs',
  'compactProcess',
  'membership',
  'registration',
  'faq',
]

export const JK_SITE_CONTENT: SiteContent = {
  navCtaShort: 'Anfrage',
  navCtaLong: 'Trainingsanfrage stellen',

  heroBadge: 'Aktuelle Sommercamps · {clubName}',
  heroHeadlineLines: [{ text: '{heroTagline}' }],
  heroSubline: 'Individuelles Training. Starke Camps. Dein nächstes Level.',
  heroPrimaryCtaLabel: 'Trainingsanfrage stellen',
  heroSecondaryCtaLabel: 'Aktuelle Sommercamps ansehen',
  heroTertiaryCtaLabel: 'Mitgliedschaft',
  heroTertiaryCtaHref: '#mitgliedschaft',
  heroFootnote: 'Für Spielerinnen und Spieler · Individuelle Spielerentwicklung · Training in deiner Region',
  // Bewusst ohne Preis: campPrice stammt aus dem Backend und hat keinen Bezug
  // zu JKs gestaffelten Camp-Preisen (149 €/169 € je Camp, sonst auf Anfrage).
  heroFacts: [
    { value: '{programCount}', label: 'Programme & Formate' },
    { value: '{featuredCount}', label: 'Aktuelle Camps' },
    { value: 'Flexibel', label: 'Trainingsformate' },
    { value: '{venueName}', label: 'Standort' },
  ],
  heroCompact: true,

  highlightsEyebrow: 'Warum JK?',
  highlightsHeading: 'Für Spieler, die mehr wollen',

  processEyebrow: '',
  processHeading: '',
  processSteps: [],
  compactProcessEyebrow: 'So einfach geht’s',
  compactProcessSteps: [
    { step: '1', title: 'Anfrage stellen', text: 'Sag uns, was dich interessiert.' },
    { step: '2', title: 'Wir melden uns', text: 'Persönlich, meist innerhalb weniger Tage.' },
    { step: '3', title: 'Loslegen', text: 'Training, Camp oder Event vereinbaren.' },
  ],

  campDatesEyebrow: '',
  campDatesHeading: '',
  campDatesMetaParts: [],

  membershipHeading: 'Mitgliedschaft in Vorbereitung',
  membershipText:
    'Du möchtest Teil der JK Performance Academy werden? Die Mitgliedschaft ist aktuell in Vorbereitung. Schreib uns bei Interesse – wir informieren dich, sobald der Prozess startet.',
  membershipCtaLabel: 'Interesse an Mitgliedschaft melden',
  membershipMailSubject: 'Interesse an Mitgliedschaft',

  registrationEyebrow: 'Trainingsanfrage',
  registrationHeading: 'Anfrage stellen',
  registrationIntro: 'Schreib uns, welches Programm dich interessiert – wir melden uns bei dir.',
  // CP-JK-101: echtes Anfrageformular gegen POST /inquiries.
  // Auf 'inquiry' zurückstellen, falls der JK-Service die Route noch nicht
  // ausliefert (INQUIRIES_ENABLED nicht gesetzt oder Migration nicht
  // eingespielt) — dann greift wieder der mailto-Interimsblock.
  registrationMode: 'inquiry-form',
  // Muss zur Allowlist INQUIRY_TOPICS im Backend passen, falls dort eine
  // gesetzt ist. Ohne Allowlist im Backend ist diese Liste allein maßgeblich.
  registrationTopics: [
    'Individualtraining',
    'Kleingruppentraining',
    'Camp bei FSK Vollmarshausen',
    'Camp bei TSV Wolfsanger',
    '5 Freunde',
    'Messday',
    'Spieleranalyse',
  ],
  registrationContactHeading: 'Fragen zu unseren Programmen?',
  registrationContactLines: [
    { text: '{contactName}' },
    { text: 'Kontakt per Instagram/WhatsApp in Vorbereitung' },
  ],
  registrationSidebarHeading: 'So geht’s weiter',
  registrationSidebarSteps: [
    'Anfrage senden',
    'Wir melden uns bei dir',
    'Programm & Termin abstimmen',
  ],
  registrationInquirySteps: [
    { step: '1', title: 'Nachricht senden', text: 'Per E-Mail an uns' },
    { step: '2', title: 'Wir melden uns', text: 'Meist innerhalb weniger Tage' },
    { step: '3', title: 'Loslegen', text: 'Programm & Termin abstimmen' },
  ],

  faqEyebrow: 'Fragen & Antworten',
  faqHeading: 'Häufige Fragen',

  footerDisplayName: '{clubName}',
  footerDescription: '{subtitle} der {clubName} — individuelle Spielerentwicklung für Kinder und Jugendliche.',
  footerContactLines: [
    '{clubName}',
    'Kontakt per Instagram/WhatsApp in Vorbereitung',
  ],
  footerPrivacyPurpose: 'deiner Anfrage',
  footerCopyrightName: '{clubName}',

  metaTitle: '{subtitle} – {clubName}',
  metaDescription: 'Events & Programme der {subtitle} {clubName} – individuelle Spielerentwicklung für Kinder und Jugendliche.',
}
