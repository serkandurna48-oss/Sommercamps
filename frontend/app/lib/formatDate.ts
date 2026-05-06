/**
 * Formatiert einen ISO-Datumsstring ins deutsche Format DD.MM.YYYY.
 *
 * - Reine Datumsstrings (YYYY-MM-DD) werden ohne Timezone-Verschiebung geparst,
 *   damit es nicht zu einem Tagversatz kommt (z.B. UTC midnight → Vortag in DE).
 * - Datetime-Strings mit Timezone-Info werden per toLocaleDateString formatiert.
 */
export function formatDateDE(dateString: string | null | undefined): string {
  if (!dateString) return '–'

  // Datum ohne Uhrzeit: direkt parsen, kein Timezone-Shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-')
    return `${d}.${m}.${y}`
  }

  // Datetime mit Timezone: Browser-lokale Formatierung
  return new Date(dateString).toLocaleDateString('de-DE', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  })
}
