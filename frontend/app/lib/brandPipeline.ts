/**
 * Geteilte Mandanten-Farbpipeline — Ticket "CampsPilot Eltern-Flow (Vereins-Themes)" §5,
 * wortgleich mit dem in paket-eltern/reference/index.html gemessenen computeBrand().
 *
 * organizations.primary_color (roher Hex) + der Grund, auf dem die Farbe sitzt (--surface des
 * aktiven Themes) -> drei Tokens mit Kontrast-Garantie. Beidseitig: auf hellem Grund wird
 * abgedunkelt, auf dunklem Grund aufgehellt (up = lum(ground) < 0.2) — dieselbe Funktion trägt
 * damit sowohl das helle "tradition"- als auch das dunkle "akademie"-Theme.
 *
 * Genutzt vom Org-Admin-Dashboard (Ground = --cp-paper, immer hell -> läuft immer abwärts) und
 * vom öffentlichen Eltern-Flow (Ground = --surface des jeweiligen Themes).
 *
 * ABWEICHUNG vom Ticket (Abschnitt 0: geht als Frage zurück, keine eigene Entscheidung): §5
 * nennt als gemessenes Ergebnis für JK (#C79B3B) auf tradition-Grund (#FFFFFF) "#7A5A12,
 * 5,8:1". Der hier wörtlich übernommene Algorithmus (Schrittweite 0.006, Abbruch bei ERSTER
 * Zielerreichung >=4.5:1) liefert für diesen Fall einen helleren, näher an 4.5:1 liegenden
 * Wert als #7A5A12/5.8:1 — die Kontrastkurve ist glatt und monoton (siehe Testdatei), kein
 * Rechenfehler. Ticket-Code und Referenz-Code sind hier byte-identisch, die Abweichung liegt
 * einzig zwischen dem Algorithmus und dem illustrativen Beispielwert in der Tabelle. Diese
 * Implementierung hält sich an den wörtlichen Algorithmus und erfüllt die harte Anforderung
 * ">=4.5:1" — Rückfrage an Serkan, falls stattdessen der größere Sicherheitsabstand aus dem
 * Beispielwert gewünscht ist.
 */

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

const MIN_CONTRAST = 4.5
const STEP = 0.006
const MIN_L = 0.04
const MAX_L = 0.99
const DARK_GROUND_LUMINANCE = 0.2
const MAX_ITERATIONS = 180

const WHITE_HEX = '#FFFFFF'
const NEAR_BLACK_HEX = '#101514'

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
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
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

/** OKLab -> sRGB (0-255). */
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

export interface BrandResult {
  /** Die Vereinsfarbe unverändert — nur für Flächen und Balken, nie für Text. */
  brand: string
  /** In OKLCH so lange gegen den Grund verschoben, bis >=4,5:1 — für Text, Rahmen, Buttons. */
  strong: string
  /** Weiß oder #101514, je nachdem, was auf `strong` >=4,5:1 erreicht. */
  on: string
  /** Tatsächlich erreichtes Kontrastverhältnis von `strong` gegen den Grund. */
  ratio: number
}

/**
 * Ticket §5 / reference computeBrand(hex, ground) — wortgleich portiert.
 * `ground` ist der Hex-Wert von --surface des aktiven Themes.
 */
export function computeBrand(hex: string, ground: string): BrandResult {
  const rgb = hexToRgb(hex)
  const groundRgb = hexToRgb(ground)
  const lab = rgbToOklab(rgb)
  const up = relativeLuminance(groundRgb) < DARK_GROUND_LUMINANCE

  let L = lab.L
  let out = rgb

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const cand = oklabToRgb({ L, a: lab.a, b: lab.b })
    out = cand
    if (contrastRatio(cand, groundRgb) >= MIN_CONTRAST) break
    L += up ? STEP : -STEP
    if (L <= MIN_L || L >= MAX_L) break
  }

  return {
    brand: rgbToHex(rgb),
    strong: rgbToHex(out),
    on: contrastRatio(hexToRgb(WHITE_HEX), out) >= MIN_CONTRAST ? WHITE_HEX : NEAR_BLACK_HEX,
    ratio: contrastRatio(out, groundRgb),
  }
}

/**
 * Fallback für ungültige/fehlende Eingaben — CampsPilot-Eigenfarbe (siehe auch
 * FALLBACK_ACCENT in pilot/theme.ts, bewusst dupliziert statt importiert, §13).
 */
export const FALLBACK_BRAND_COLOR = '#2B6F4C'

/** Wie computeBrand, aber toleriert ungültige/fehlende Eingaben mit Fallback-Farbe. */
export function computeBrandSafe(
  primaryColor: string | null | undefined,
  ground: string,
): BrandResult {
  const input = primaryColor && isValidHex(primaryColor) ? primaryColor : FALLBACK_BRAND_COLOR
  return computeBrand(input, ground)
}

// Nur für Tests.
export const __internal = { contrastRatio, hexToRgb, rgbToHex, rgbToOklab, oklabToRgb, relativeLuminance }
