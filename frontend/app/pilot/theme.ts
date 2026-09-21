// Design tokens for /pilot/[org]. One dynamic value per org — primaryColor —
// everything else stays fixed. See OrgPublic.primary_color in ../lib/saasApi.

export const FALLBACK_ACCENT = '#2B6F4C' // CampsPilot's own identity when an org sets no color

export const PAPER = '#F0F2ED'
export const INK = '#14181A'
export const MUTED = '#5B6158'
export const LINE = '#D8DBD3'

/** White text on dark/saturated accents, ink text on light accents (e.g. JK's gold). */
export function accentContrast(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#FFFFFF'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  // Perceived luminance (ITU-R BT.601) — cheap, good enough for a two-way pick.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? INK : '#FFFFFF'
}
