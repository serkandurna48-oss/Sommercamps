// Club-Identität (CP-S301-light / CP-S308-light) — zentraler Ort für club-spezifische Werte.
// Ohne NEXT_PUBLIC_ACTIVE_CLUB=jk verhält sich die App exakt wie vor dieser Extraktion (KSV-Defaults).

import { JK_OVERRIDES } from './clubConfig.jk'

export interface ClubIdentity {
  name: string
  subtitle: string
  contactName: string
  contactEmail: string
  contactPhone: string
  venueName: string
  logoSrc: string
  /** Optional Hero-Hintergrundbild; ohne Wert bleibt der Hero ein reiner Farbblock. */
  heroImageSrc?: string
  /** Optionale Akzentfarbe (Hex); ohne Wert bleibt KSV-Rot (#CC0000) aktiv. */
  accentColor?: string
  /** Optionaler Hero-Claim; ersetzt bei PROGRAMS-Clubs die generische "{subtitle} 2026"-Headline. */
  heroTagline?: string
}

export interface CampEntry {
  label: string
  date: string
  value: string
  tag: string
}

/**
 * Ein Event-/Programm-Eintrag für Vereine mit breiterem Angebot als KSVs
 * "3 Sommercamp-Wochen" (z. B. wiederkehrende Sessions, Feriencamps,
 * Einzeltermine). `cadence` ist Freitext zur Terminierung, kein festes Datum —
 * anders als `CampEntry.date`, das eine konkrete buchbare Woche beschreibt.
 */
export interface ProgramEntry {
  category: string
  title: string
  description: string
  cadence: string
  tag?: string
}

export interface HighlightEntry {
  icon: React.ReactNode
  title: string
  text: string
}

export interface FaqEntry {
  q: string
  a: string
}

const ACTIVE_CLUB = process.env.NEXT_PUBLIC_ACTIVE_CLUB === 'jk' ? 'jk' : 'ksv'

const DEFAULT_CLUB_CONFIG: ClubIdentity = {
  name: process.env.NEXT_PUBLIC_CLUB_NAME ?? 'KSV Baunatal',
  subtitle: process.env.NEXT_PUBLIC_CLUB_SUBTITLE ?? 'Fußballschule',
  contactName: process.env.NEXT_PUBLIC_CONTACT_NAME ?? 'Ergün Ünal',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'Erguen.uenal@fussball.ksv-baunatal.de',
  contactPhone: process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '0170 9927281',
  venueName: process.env.NEXT_PUBLIC_VENUE_NAME ?? 'Parkstadion Baunatal',
  logoSrc: process.env.NEXT_PUBLIC_LOGO_SRC ?? '/logo.svg',
}

const DEFAULT_CAMPS: CampEntry[] = [
  { label: 'Sommercamp I',  date: '29.06. – 02.07.2026', value: '29.06.–02.07.2026', tag: 'Sommer' },
  { label: 'Sommercamp II', date: '03.08. – 06.08.2026', value: '03.08.–06.08.2026', tag: 'Sommer' },
  { label: 'Herbstcamp',    date: '05.10. – 08.10.2026', value: '05.10.–08.10.2026', tag: 'Herbst' },
]

// Leer für KSV (nutzt weiterhin die Termine-Sektion auf Basis von CAMPS).
// Clubs mit breiterem Angebot (z. B. JK) füllen PROGRAMS statt CAMPS —
// page.tsx zeigt genau eine der beiden Sektionen, nie beide.
const DEFAULT_PROGRAMS: ProgramEntry[] = []

const DEFAULT_HIGHLIGHTS: HighlightEntry[] = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    title: 'Qualifizierte Trainer',
    text: 'Training mit qualifizierten Jugendtrainern und Patenspielern, unterstützt durch Jugendspieler der A- und B-Jugend. Altersgerechtes Konzept mit Technik- und Taktikübungen, abwechslungsreichen Spielformen sowie Teamgeist und Motivation.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    title: 'Training mit Spielern der 1. Mannschaft',
    text: 'Einblicke in den Trainingsalltag auf dem Vereinsgelände des KSV.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z" />
      </svg>
    ),
    title: 'Verpflegung inklusive',
    text: 'Warmes Mittagessen, Obst, Snacks und Getränke sind im Preis enthalten. Kein Extra-Aufwand für Eltern.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
      </svg>
    ),
    title: 'Trikot, Hose & Pokal',
    text: 'Jedes Kind bekommt ein offizielles KSV-Trikot, eine Hose und einen Teilnehmerpokal. Dazu gibt es eine Eintrittskarte für ein Heimspiel der 1. Mannschaft.',
  },
]

const DEFAULT_JERSEY_SIZES = ['6XS–5XS (104–116)', '4XS–3XS (128–140)', '2XS (152)', 'XS (164)', 'S', 'M']

const DEFAULT_INCLUDED_ITEMS = [
  'KSV-Trikot & Hose',
  'Teilnehmerpokal',
  'Warmes Mittagessen, Obst & Snacks',
  'Eintrittskarte für ein Heimspiel',
  'Qualifizierte Betreuung',
]

const DEFAULT_FAQ_ITEMS: FaqEntry[] = [
  {
    q: 'Für welches Alter ist das Camp geeignet?',
    a: 'Das Camp richtet sich an Kinder im Alter von 5 bis 12 Jahren.',
  },
  {
    q: 'Was ist im Beitrag enthalten?',
    a: 'Warmes Mittagessen, Obst, Snacks und Getränke, ein offizielles KSV-Trikot und Hose, ein Teilnehmerpokal sowie eine Eintrittskarte für ein Heimspiel der 1. Mannschaft sind im Beitrag inklusive.',
  },
  {
    q: 'Wie bezahle ich?',
    a: 'Die Zahlung erfolgt per Überweisung. Die Bankdaten sowie den Verwendungszweck erhältst du direkt nach der Anmeldung per E-Mail.',
  },
  {
    q: 'Wann gilt die Anmeldung als abgeschlossen?',
    a: 'Die Anmeldung ist vollständig bestätigt, sobald der Campbeitrag auf unserem Konto eingegangen ist.',
  },
  {
    q: 'Können Kinder mit Allergien teilnehmen?',
    a: 'Ja. Bitte trage alle relevanten Allergien und Unverträglichkeiten im Anmeldeformular ein, damit wir entsprechend planen können.',
  },
  {
    q: 'An wen wende ich mich bei Fragen?',
    a: `Für alle Fragen steht dir ${DEFAULT_CLUB_CONFIG.contactName} zur Verfügung: ${DEFAULT_CLUB_CONFIG.contactEmail} · ${DEFAULT_CLUB_CONFIG.contactPhone}`,
  },
]

const DEFAULT_VENUE_INFO_TEXT =
  'Kunstrasen am Parkstadion in Baunatal. Bei Bedarf weichen wir auf Ausweichplätze aus, z. B. die Sportanlage am Baunsberg.'

const DEFAULT_FIRST_TEAM_INFO_TEXT =
  'Trainingseinheiten mit Spielern der 1. Mannschaft finden – sofern es zeitlich möglich ist – im Rahmen des Camps statt. Wir bitten um Verständnis, dass dies organisatorisch und terminlich abhängig ist und daher nicht garantiert werden kann.'

export const CLUB_CONFIG: ClubIdentity =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.CLUB_CONFIG : DEFAULT_CLUB_CONFIG

export const CAMPS: CampEntry[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.CAMPS : DEFAULT_CAMPS

export const PROGRAMS: ProgramEntry[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.PROGRAMS : DEFAULT_PROGRAMS

export const HIGHLIGHTS: HighlightEntry[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.HIGHLIGHTS : DEFAULT_HIGHLIGHTS

export const JERSEY_SIZES: string[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.JERSEY_SIZES : DEFAULT_JERSEY_SIZES

export const INCLUDED_ITEMS: string[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.INCLUDED_ITEMS : DEFAULT_INCLUDED_ITEMS

export const FAQ_ITEMS: FaqEntry[] =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.FAQ_ITEMS : DEFAULT_FAQ_ITEMS

// Freitext-Infoboxen im Termine-Bereich — pro Club optional. `null` blendet die Box komplett aus,
// statt club-fremden Text (z. B. KSV-Vereinsstruktur) anzuzeigen.
export const VENUE_INFO_TEXT: string | null =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.VENUE_INFO_TEXT : DEFAULT_VENUE_INFO_TEXT

export const FIRST_TEAM_INFO_TEXT: string | null =
  ACTIVE_CLUB === 'jk' ? JK_OVERRIDES.FIRST_TEAM_INFO_TEXT : DEFAULT_FIRST_TEAM_INFO_TEXT
