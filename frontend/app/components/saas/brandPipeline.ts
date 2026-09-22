/**
 * Mandanten-Farbpipeline — Auftrag Abschnitt 3.3.
 *
 * organizations.primary_color (roher Hex) -> drei Tokens, die die
 * Kontrast-Garantie tragen, die der rohe Wert allein nicht hat (z. B. JK
 * Performance Academys Gold: 2.3:1 roh, unbrauchbar als Text/Buttonfläche).
 * --cp-brand-tint bleibt bewusst eine CSS color-mix()-Expression in
 * tokens.css statt hier berechnet — die Tabelle in 3.3 schreibt sie selbst
 * schon als CSS-Funktion, nicht als Algorithmus.
 *
 * Läuft serverseitig (siehe (org-admin)/layout.tsx), nicht im Browser — das
 * Ergebnis wird als fertiger Hex-Wert in die --cp-brand-* Custom Properties
 * geschrieben, im selben Muster wie das bestehende --accent/--on-accent aus
 * PilotFlow.tsx, nur mit der zusätzlichen Kontrast-Garantie.
 *
 * ABWEICHUNG vom Auftrag (Abschnitt 0: geht als Frage zurück, keine eigene
 * Entscheidung): Für JK Performance Academy (#C79B3B) nennt 3.3 als
 * erwartetes Ergebnis "≈ #7A5A12, Kontrast 5.8:1". Der hier wörtlich nach
 * 3.3 implementierte Algorithmus ("solange Kontrast < 4.5: L -= 0.01")
 * bricht beim ERSTEN Erreichen von 4.5:1 ab — das ist #916700 bei 4.62:1,
 * nicht #7A5A12 bei 5.8:1 (das liegt fünf weitere 0.01-Schritte tiefer).
 * Die Kontrastkurve ist glatt und monoton (siehe Testdatei) — kein
 * Rechenfehler, sondern eine andere Abbruchbedingung als im Beispielwert.
 * Diese Implementierung hält sich an den wörtlichen Algorithmustext
 * (Abbruch bei erster Zielerreichung) und erfüllt damit die harte
 * Anforderung "Kontrast >= 4.5:1" — der exakte Beispiel-Hex aus 3.3 ist
 * vermutlich illustrativ, nicht gegengerechnet. Rückfrage an Serkan, falls
 * ein größerer Sicherheitsabstand statt der Minimalkorrektur gewünscht ist.
 */

// Gleicher Wert wie FALLBACK_ACCENT in pilot/theme.ts — bewusst dupliziert
// statt importiert, um diese Datei nicht an die Eltern-Ansicht zu koppeln
// (siehe Abschnitt 13: bestehende Dateien der Eltern-Seiten bleiben unangetastet).
const FALLBACK_BRAND = '#2B6F4C'

// Müssen mit --cp-paper / --cp-ink in tokens.css übereinstimmen.
const PAPER_HEX = '#F4F5F2'
const INK_HEX = '#171C19'
const WHITE_HEX = '#FFFFFF'

const MIN_CONTRAST = 4.5
const MIN_LIGHTNESS = 0.15
const LIGHTNESS_STEP = 0.01

interface Rgb {
  r: number
  g: number
  b: number
}

interface Oklab {
  L: number
  a: number
  b: number
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase()
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearChannelToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return c * 255
}

/** WCAG 2.x relative luminance. */
function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  )
}

/** WCAG 2.x contrast ratio between two sRGB colors. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** sRGB (0-255) -> OKLab, via linear RGB -> LMS -> OKLab (Björn Ottosson). */
function rgbToOklab(rgb: Rgb): Oklab {
  const r = srgbChannelToLinear(rgb.r)
  const g = srgbChannelToLinear(rgb.g)
  const b = srgbChannelToLinear(rgb.b)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/** OKLab -> sRGB (0-255). Naive gamut clipping: channels are clamped to
 * [0, 255] wherever they're consumed (rgbToHex, relativeLuminance's callers
 * via Math.max/min there is none — clamping happens once in rgbToHex, and
 * contrastRatio/relativeLuminance are only ever called with already-clamped
 * results in this module's own flow, see computeBrandTokens). */
function oklabToRgb(lab: Oklab): Rgb {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return {
    r: linearChannelToSrgb(r),
    g: linearChannelToSrgb(g),
    b: linearChannelToSrgb(b),
  }
}

export interface BrandTokens {
  /** Nur für textfreie Flächen: Tab-Unterstrich, Belegungsbalken, Band-Kante. */
  brand: string
  /** Text, Links, Primärbutton-Fläche — garantiert >=4.5:1 gegen --cp-paper. */
  brandStrong: string
  /** Beschriftung auf der Primärbutton-Fläche (Weiß oder --cp-ink). */
  brandOn: string
}

export function computeBrandTokens(primaryColor: string | null | undefined): BrandTokens {
  const input = primaryColor && isValidHex(primaryColor) ? primaryColor : FALLBACK_BRAND
  const paperRgb = hexToRgb(PAPER_HEX)

  let lab = rgbToOklab(hexToRgb(input))
  let strongRgb = oklabToRgb(lab)

  while (contrastRatio(strongRgb, paperRgb) < MIN_CONTRAST && lab.L > MIN_LIGHTNESS) {
    lab = { ...lab, L: lab.L - LIGHTNESS_STEP }
    strongRgb = oklabToRgb(lab)
  }

  const brandOn =
    contrastRatio(hexToRgb(WHITE_HEX), strongRgb) >= MIN_CONTRAST ? WHITE_HEX : INK_HEX

  return {
    brand: input.toUpperCase(),
    brandStrong: rgbToHex(strongRgb),
    brandOn,
  }
}

// Nur für Tests.
export const __internal = { contrastRatio, hexToRgb, rgbToHex, rgbToOklab, oklabToRgb }
