// ---------------------------------------------------------------------------
// Seiteninhalt und Sektionsreihenfolge je Mandant (CP-JK-104, Schritt 2)
//
// Vorher entschied eine Fallunterscheidung auf PROGRAMS.length in page.tsx,
// welche Sektionen ein Mandant sieht und welche Texte darin stehen. Damit wäre
// Kunde drei ein dritter Zweig in derselben Datei gewesen.
//
// Jetzt gilt: page.tsx läuft über SECTION_ORDER und liest jeden Text aus
// SITE_CONTENT. Ein neuer Mandant braucht keine Änderung an page.tsx und an
// keiner Sektionskomponente — nur einen Eintrag hier.
//
// Alle Werte sind bewusst JSON-serialisierbar (Strings, Arrays, Booleans, keine
// Funktionen und kein JSX). Das ist Voraussetzung dafür, dass die Konfiguration
// später aus der Datenbank statt aus einer TypeScript-Datei kommen kann, wie es
// docs/saas/architecture.md vorsieht.
// ---------------------------------------------------------------------------

import { JK_SITE_CONTENT, JK_SECTION_ORDER } from './siteContent.jk'

const ACTIVE_CLUB = process.env.NEXT_PUBLIC_ACTIVE_CLUB === 'jk' ? 'jk' : 'ksv'

/** Alle Sektionen, die die Startseite kennt. Header und Footer sind kein Teil der Liste. */
export type SectionId =
  | 'slideshow'
  | 'featuredCamps'
  | 'otherOffers'
  | 'whyUs'
  | 'highlights'
  | 'compactProcess'
  | 'process'
  | 'membership'
  | 'campDates'
  | 'registration'
  | 'faq'

export interface TextLine {
  text: string
  /** Hebt die Zeile in der Akzentfarbe hervor (nur Hero-Headline). */
  accent?: boolean
}

export interface ContactLine {
  text: string
  /** 'email' rendert die Zeile als mailto-Link. */
  link?: 'email'
}

export interface FactSpec {
  /** Template. Lässt sich eine Variable nicht auflösen, entfällt die ganze Kachel. */
  value: string
  label: string
}

export interface StepSpec {
  step: string
  title: string
  text: string
}

export interface SiteContent {
  // Kopfzeile
  navCtaShort: string
  navCtaLong: string

  // Hero
  heroBadge: string
  heroHeadlineLines: TextLine[]
  heroSubline: string
  heroPrimaryCtaLabel: string
  heroSecondaryCtaLabel: string
  heroTertiaryCtaLabel?: string
  heroTertiaryCtaHref?: string
  heroFootnote?: string
  heroFacts: FactSpec[]
  /** Engere Paddings und schmalere Textspalte. */
  heroCompact: boolean

  // Highlights / Warum wir
  highlightsEyebrow: string
  highlightsHeading: string

  // Ablauf
  processEyebrow: string
  processHeading: string
  processSteps: StepSpec[]
  compactProcessEyebrow: string
  compactProcessSteps: StepSpec[]

  // Termine
  campDatesEyebrow: string
  campDatesHeading: string
  /** Metazeile je Terminkarte. Teile mit unauflösbarer Variable entfallen. */
  campDatesMetaParts: string[]

  // Mitgliedschaft
  membershipHeading: string
  membershipText: string
  membershipCtaLabel: string
  membershipMailSubject: string

  // Anmeldung / Anfrage
  registrationEyebrow: string
  registrationHeading: string
  registrationIntro: string
  registrationMode: 'camp' | 'inquiry'
  registrationContactHeading: string
  registrationContactLines: ContactLine[]
  registrationSidebarHeading: string
  registrationSidebarSteps: string[]
  registrationInquirySteps: StepSpec[]

  // FAQ
  faqEyebrow: string
  faqHeading: string

  // Footer
  footerDisplayName: string
  footerDescription: string
  footerContactLines: string[]
  footerPrivacyPurpose: string
  footerCopyrightName: string

  // Metadaten
  metaTitle: string
  metaDescription: string
}

// ---------------------------------------------------------------------------
// Template-Auflösung
//
// "{clubName}"        — wird ersetzt.
// "[[ … {ageRange} ]]" — der Block entfällt vollständig, wenn eine Variable
//                        darin unbekannt ist. So verschwindet z. B. die
//                        Altersangabe, statt eine geratene Zahl zu zeigen.
// ---------------------------------------------------------------------------

export type TemplateVars = Record<string, string | null | undefined>

const PLACEHOLDER = /\{(\w+)\}/g
const OPTIONAL_BLOCK = /\[\[([\s\S]*?)\]\]/g

function hasUnresolved(text: string, vars: TemplateVars): boolean {
  PLACEHOLDER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLACEHOLDER.exec(text)) !== null) {
    const v = vars[m[1]]
    if (v === null || v === undefined || v === '') return true
  }
  return false
}

/**
 * Löst ein Template auf. Gibt `null` zurück, wenn außerhalb optionaler Blöcke
 * eine Variable fehlt — der Aufrufer lässt das Element dann weg.
 */
export function fillOrNull(template: string, vars: TemplateVars): string | null {
  const withoutOptional = template.replace(OPTIONAL_BLOCK, (_full, inner: string) =>
    hasUnresolved(inner, vars) ? '' : inner,
  )
  if (hasUnresolved(withoutOptional, vars)) return null
  return withoutOptional.replace(PLACEHOLDER, (_full, key: string) => String(vars[key] ?? ''))
}

/** Wie `fillOrNull`, gibt bei fehlender Variable aber einen leeren String zurück. */
export function fill(template: string, vars: TemplateVars): string {
  return fillOrNull(template, vars) ?? ''
}

// ---------------------------------------------------------------------------
// KSV Baunatal — die Vorgabe. Ohne NEXT_PUBLIC_ACTIVE_CLUB=jk gilt genau das,
// und zwar wortgleich zur Fassung vor dieser Umstellung.
// ---------------------------------------------------------------------------

const DEFAULT_SECTION_ORDER: SectionId[] = [
  'highlights',
  'process',
  'campDates',
  'registration',
  'faq',
]

const DEFAULT_SITE_CONTENT: SiteContent = {
  navCtaShort: 'Anmelden',
  navCtaLong: 'Jetzt anmelden',

  heroBadge: 'Sommercamps 2026 · {clubName}',
  heroHeadlineLines: [
    { text: '{subtitle} 2026' },
    { text: 'beim {clubName}', accent: true },
  ],
  heroSubline: '4 Tage professionelles Training, Spaß und Entwicklung[[ für Kinder von {ageRange} Jahren]].',
  heroPrimaryCtaLabel: 'Jetzt Platz sichern',
  heroSecondaryCtaLabel: 'Termine ansehen',
  heroFacts: [
    { value: '3', label: 'Camp-Termine 2026' },
    { value: '4 Tage', label: 'je Camp' },
    { value: '{ageRangeSpaced}', label: 'Jahre' },
    { value: '{campPrice}', label: 'Campbeitrag' },
    { value: '{venueName}', label: 'Standort' },
  ],
  heroCompact: false,

  highlightsEyebrow: 'Das erwartet euch',
  highlightsHeading: 'Warum unser Camp?',

  processEyebrow: 'Einfach & unkompliziert',
  processHeading: 'So läuft die Anmeldung ab',
  processSteps: [
    {
      step: '01',
      title: 'Termin wählen',
      text: 'Wähle einen der verfügbaren Camp-Termine und klicke auf "Anmelden" – der Termin wird im Formular automatisch vorausgewählt.',
    },
    {
      step: '02',
      title: 'Anmeldung absenden',
      text: 'Trage die Daten deines Kindes ein und sende das Formular ab. Die Anmeldung dauert nur wenige Minuten.',
    },
    {
      step: '03',
      title: 'Bestätigung & Zahlung',
      text: 'Du erhältst sofort eine Bestätigungs-E-Mail mit den Bankdaten. Nach Zahlungseingang ist der Platz gesichert.',
    },
  ],
  compactProcessEyebrow: 'So einfach geht’s',
  compactProcessSteps: [],

  campDatesEyebrow: 'Wann findet es statt',
  campDatesHeading: 'Termine 2026',
  campDatesMetaParts: ['4 Tage', '10:00–15:00 Uhr', 'Kinder {ageRange} Jahre'],

  membershipHeading: '',
  membershipText: '',
  membershipCtaLabel: '',
  membershipMailSubject: '',

  registrationEyebrow: 'Online-Anmeldung',
  registrationHeading: 'Platz sichern',
  registrationIntro: 'Direkt nach der Anmeldung erhältst du eine Bestätigungs-E-Mail mit allen Zahlungsinformationen.',
  registrationMode: 'camp',
  registrationContactHeading: 'Fragen zur Anmeldung?',
  registrationContactLines: [
    { text: '{contactName} – Leiter {subtitle}' },
    { text: '{contactEmail}', link: 'email' },
    { text: '{contactPhone}' },
  ],
  registrationSidebarHeading: 'Nach der Anmeldung',
  registrationSidebarSteps: [
    'E-Mail mit Bankdaten erhalten',
    'Campbeitrag überweisen',
    'Platz ist gesichert',
  ],
  registrationInquirySteps: [],

  faqEyebrow: 'Häufige Fragen',
  faqHeading: 'FAQ für Eltern',

  footerDisplayName: '{clubName}',
  footerDescription: '{subtitle} des {clubName} e.V. — qualifiziertes Training[[ für Kinder von {ageFrom} bis {ageTo} Jahren]].',
  footerContactLines: [
    '{clubName} e.V.',
    'Leiter {subtitle}: {contactName}',
    '{contactEmail}',
    '{contactPhone}',
  ],
  footerPrivacyPurpose: 'der Camp-Anmeldung',
  footerCopyrightName: '{clubName} e.V.',

  metaTitle: '{subtitle} Sommercamp 2026 – {clubName}',
  metaDescription: 'Melde dein Kind jetzt für das Sommercamp 2026 der {subtitle} {clubName} an. 4 Tage professionelles Training[[ für Kinder von {ageRange} Jahren]].',
}

export const SECTION_ORDER: SectionId[] =
  ACTIVE_CLUB === 'jk' ? JK_SECTION_ORDER : DEFAULT_SECTION_ORDER

export const SITE_CONTENT: SiteContent =
  ACTIVE_CLUB === 'jk' ? JK_SITE_CONTENT : DEFAULT_SITE_CONTENT
