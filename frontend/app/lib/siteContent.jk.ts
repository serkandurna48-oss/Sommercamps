// ---------------------------------------------------------------------------
// JK Performance Academy — Seiteninhalt und Sektionsreihenfolge.
//
// Stand: Richtung B (Performance Editorial), freigegeben am 21.09.2026.
// Designreferenz: docs/design/jk-redesign-b-handoff.md.
//
// Was hier gegenüber der alten Fassung entfällt und warum (Handoff, Abschnitt 11):
//   • slideshow    — bildschirmfüllendes Karussell direkt nach dem Hero,
//                    unterbrach den Fluss genau dort, wo das Angebot stehen muss
//   • membership   — "in Vorbereitung" darf nicht mit der Hauptkonversion
//                    konkurrieren; bleibt als FAQ-Antwort erhalten
//   • heroFacts    — "5 Programme · 2 Camps · Flexibel" zählte das eigene
//                    Inventar, nicht Kompetenz; ersetzt durch die Partnerleiste
//   • dritte Hero-CTA — drei gleichrangige Buttons bedeuten keine Priorität
// ---------------------------------------------------------------------------

import type { SectionId, SiteContent } from './siteContent'

export const JK_SECTION_ORDER: SectionId[] = [
  'hero',
  'trustBar',
  'coreOffers',
  'featuredCamps',
  'whyUs',
  'otherOffers',
  'registration',
  'faq',
]

export const JK_SITE_CONTENT: SiteContent = {
  theme: 'editorial',

  navCtaShort: 'Anfragen',
  navCtaLong: 'Training anfragen',
  navItems: [
    { label: 'Training', href: '#training' },
    { label: 'Camps', href: '#camps' },
    { label: 'Anfrage', href: '#anmeldung' },
    { label: 'FAQ', href: '#faq' },
  ],

  heroEyebrow: 'Region Kassel',
  heroBadge: '',
  heroHeadlineLines: [{ text: 'Individuelles Fußballtraining für ambitionierte Spieler' }],
  heroSubline: 'Technik, Spielverständnis und persönliche Entwicklung — ergänzend zu deinem Vereinstraining.',
  heroPrimaryCtaLabel: 'Training anfragen',
  heroSecondaryCtaLabel: 'Aktuelle Camps ansehen',
  heroFootnote: 'Für Spielerinnen und Spieler · Einzel, Kleingruppe und Team · Training in deiner Region',
  heroFacts: [],
  heroCompact: true,
  heroImageAlt: 'Spielerinnen und Spieler der JK Performance Academy mit ihrem Trainer',

  trustBarLabel: 'Unsere Partnervereine',
  trustBarPartners: ['FSK Vollmarshausen', 'TSV Wolfsanger'],
  // Sichtbar markiert statt erfunden. Sobald eine belegbare Qualifikation
  // vorliegt, ersetzt sie diesen Hinweis.
  trustBarPendingNote: 'Content benötigt: Trainerlizenz / Qualifikation',

  coreOffersEyebrow: 'Was wir anbieten',
  coreOffersHeading: 'Drei Wege, besser zu werden',
  coreOffersIntro: 'Jedes Format ergänzt dein Vereinstraining — es ersetzt es nicht.',
  coreOffers: [
    // Weiche Trennstellen (­) an der Wortfuge: Deutsche Komposita in
    // kondensierten Versalien sind breit. Ohne sie bricht der Browser
    // irgendwo mitten im Wort, sobald die Spalte eng wird.
    {
      number: '01',
      title: 'Individual­training',
      text: 'Einzeltraining mit klarem Fokus: Technik, Abschluss, Beidfüßigkeit, Handlungsschnelligkeit. Du bekommst nach jeder Einheit persönliches Feedback.',
    },
    {
      number: '02',
      title: 'Kleingruppen­training',
      text: 'Kleine Gruppen mit ähnlichem Niveau. Echte Spielsituationen, hohe Wiederholungszahl — und trotzdem sieht der Trainer jeden Ball.',
    },
    {
      number: '03',
      title: 'Camps & Events',
      text: 'Dreitägige Feriencamps bei unseren Partnervereinen. Stationstraining, Wettbewerbe, Videoanalyse und Verpflegung vor Ort.',
    },
  ],

  campsEyebrow: 'Jetzt buchbar',
  campsHeading: 'Aktuelle Camps 2026',
  campsMeta: 'Beide Camps: 6–14 Jahre · 9–15 Uhr',
  campsAvailabilityLabel: 'Begrenzte Plätze',
  campsCtaLabel: 'Platz anfragen',

  highlightsEyebrow: 'Warum JK',
  highlightsHeading: 'Was ein Vereinstraining selten leisten kann',

  processEyebrow: '',
  processHeading: '',
  processSteps: [],
  compactProcessEyebrow: '',
  compactProcessSteps: [],

  campDatesEyebrow: '',
  campDatesHeading: '',
  campDatesMetaParts: [],

  // Bleibt befüllt, damit die Sektion jederzeit zurück in JK_SECTION_ORDER
  // kann, sobald eine echte Warteliste existiert.
  membershipHeading: 'Mitgliedschaft in Vorbereitung',
  membershipText:
    'Du möchtest Teil der JK Performance Academy werden? Die Mitgliedschaft ist aktuell in Vorbereitung. Schreib uns bei Interesse – wir informieren dich, sobald der Prozess startet.',
  membershipCtaLabel: 'Interesse an Mitgliedschaft melden',
  membershipMailSubject: 'Interesse an Mitgliedschaft',

  registrationEyebrow: 'Anfrage',
  registrationHeading: 'Training anfragen',
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
  registrationContactHeading: 'Lieber direkt?',
  registrationContactLines: [
    { text: 'Content benötigt: E-Mail, Telefon, WhatsApp und Instagram.' },
    { text: 'Bis dahin bleibt das Formular der einzige Weg.' },
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
    'Content benötigt: E-Mail, Telefon, Instagram',
  ],
  footerPrivacyPurpose: 'deiner Anfrage',
  footerCopyrightName: '{clubName}',

  metaTitle: '{subtitle} – {clubName}',
  metaDescription: 'Individuelles Fußballtraining für ambitionierte Spielerinnen und Spieler in der Region Kassel. Technik, Spielverständnis und persönliche Entwicklung — ergänzend zum Vereinstraining.',
}
