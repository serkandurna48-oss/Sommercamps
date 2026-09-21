// ---------------------------------------------------------------------------
// Design Tokens je Mandant (CP-JK-105, Richtung B)
//
// Vorher existierte genau eine Design-Variable: --brand-accent. Alles andere —
// Flächen, Linien, Schriftfarben, Radien — steckte als Tailwind-Klassen fest im
// Markup. Damit liess sich ein Mandant nicht wirklich einkleiden.
//
// Hier steht das vollständige Set. page.tsx setzt es als CSS-Variablen auf das
// Wurzelelement; die Sektionen lesen sie über var(--…). --brand-accent bleibt
// erhalten, weil die Komponenten im Theme "classic" (KSV) darauf aufbauen.
//
// Warum vier Akzentwerte statt einem: Gold trägt dunkle Schrift, Rot braucht
// weisse. Ein einzelnes Akzent-Token würde bei KSV die Kontrastprüfung reissen.
// Ebenso brauchen Akzentlabels auf heller und auf dunkler Fläche getrennte
// Werte — Gold auf Cremeweiss fällt sonst unter 4,5:1.
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  /** Primärfläche für Buttons, Linien, Ziffern. */
  '--brand-accent': string
  '--accent': string
  /** Schrift auf Akzentfläche. */
  '--on-accent': string
  /** Akzenttext auf dunkler Fläche. */
  '--accent-quiet': string
  /** Akzenttext auf heller Fläche. */
  '--accent-ink': string

  '--surface-base': string
  '--surface-inverse': string
  '--surface-panel': string
  '--surface-card': string

  '--line-dark': string
  '--line-light': string

  '--text-on-dark': string
  '--text-on-dark-muted': string
  '--text-on-light': string
  '--text-on-light-muted': string
  '--text-quiet': string

  '--radius-card': string
  '--radius-pill': string
}

/** Für alle Mandanten gleich. Nur die Akzent- und Flächenwerte oben variieren. */
const PRODUCT_TOKENS = {
  '--surface-inverse': '#0B0F1A',
  '--surface-panel': '#141A28',
  '--surface-card': '#FFFFFF',

  '--line-dark': '#263047',
  '--line-light': '#DED8CC',

  // Kontrastwerte gegen die jeweilige Trägerfläche, WCAG AA erfüllt:
  '--text-on-dark': '#FFFFFF',        // 18,4:1 auf --surface-inverse
  '--text-on-dark-muted': '#C9CED8',  // 11,8:1
  '--text-on-light': '#11151F',       // 16,1:1 auf --surface-base
  '--text-on-light-muted': '#4A5261', //  6,9:1
  '--text-quiet': '#9AA3B2',          //  6,4:1

  '--radius-card': '4px',   // bewusst kantig
  '--radius-pill': '999px', // ausschliesslich Buttons
} as const

export const KSV_TOKENS: ThemeTokens = {
  ...PRODUCT_TOKENS,
  '--brand-accent': '#CC0000',
  '--accent': '#CC0000',
  '--on-accent': '#FFFFFF',
  '--accent-quiet': '#FF6B6B',
  '--accent-ink': '#A80000',
  // Kühleres Off-White: Rot auf warmem Creme wirkt ziegelartig.
  '--surface-base': '#F6F6F7',
}

const ACTIVE_CLUB = process.env.NEXT_PUBLIC_ACTIVE_CLUB === 'jk' ? 'jk' : 'ksv'

export const JK_TOKENS: ThemeTokens = {
  ...PRODUCT_TOKENS,
  '--brand-accent': '#B8912B',
  '--accent': '#B8912B',
  '--on-accent': '#0B0F1A',
  '--accent-quiet': '#D9B14A',
  '--accent-ink': '#8A6A16',
  '--surface-base': '#F7F4EE',
}

/** Das Set des aktiven Mandanten. page.tsx setzt es auf das Wurzelelement. */
export const THEME_TOKENS: ThemeTokens = ACTIVE_CLUB === 'jk' ? JK_TOKENS : KSV_TOKENS
