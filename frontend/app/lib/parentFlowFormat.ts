/**
 * Formatierungshilfen für den öffentlichen Eltern-Flow (Ticket §6). Reine
 * Anzeigefunktionen — keine Geschäftslogik, kein API-Aufruf.
 */

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "6. bis 9. April 2027" (oder mit zwei Monatsnamen, falls der Zeitraum die Monatsgrenze kreuzt). */
export function formatCampDateRange(startISO: string, endISO: string): string {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
  const endMonth = MONTHS_DE[end.getUTCMonth()]
  const year = end.getUTCFullYear()
  if (sameMonth) {
    return `${start.getUTCDate()}. bis ${end.getUTCDate()}. ${endMonth} ${year}`
  }
  const startMonth = MONTHS_DE[start.getUTCMonth()]
  return `${start.getUTCDate()}. ${startMonth} bis ${end.getUTCDate()}. ${endMonth} ${year}`
}

/** "Montag bis Donnerstag" */
export function formatWeekdayRange(startISO: string, endISO: string): string {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  if (start.getUTCDay() === end.getUTCDay()) return WEEKDAYS_DE[start.getUTCDay()]
  return `${WEEKDAYS_DE[start.getUTCDay()]} bis ${WEEKDAYS_DE[end.getUTCDay()]}`
}

/** Kurzform für die Campzeile: Tag ("06."), Monat ("April"), Wochentagsspanne. */
export function formatCampRowDate(startISO: string, endISO: string): { day: string; month: string; weekdays: string } {
  const start = parseISODate(startISO)
  return {
    day: `${String(start.getUTCDate()).padStart(2, '0')}.`,
    month: MONTHS_DE[start.getUTCMonth()],
    weekdays: formatWeekdayRange(startISO, endISO),
  }
}

/** 14900 -> "149,00 €" (nur EUR-Symbol; andere Währungscodes werden als Code angehängt). */
export function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`
}

/** "TT.MM.JJJJ" -> "JJJJ-MM-TT", oder null bei ungültigem Format/Datum. */
export function parseGermanDate(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, dStr, mStr, yStr] = match
  const day = Number(dStr)
  const month = Number(mStr)
  const year = Number(yStr)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${yStr}-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}`
}

/** 2-4 Buchstaben Kurzcode aus dem Vereinsnamen, z. B. "KSV Baunatal" -> "KSV". */
export function orgShortCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '–'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}
