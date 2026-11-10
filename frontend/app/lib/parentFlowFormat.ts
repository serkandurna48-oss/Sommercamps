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

const SHORT_MONTHS_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']

/** Compact German date range, including both years across a year boundary. */
export function formatCampDateRange(startISO: string, endISO: string): string {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
  const endMonth = SHORT_MONTHS_DE[end.getUTCMonth()]
  const year = end.getUTCFullYear()
  if (sameMonth) {
    return startISO === endISO
      ? `${end.getUTCDate()}. ${endMonth} ${year}`
      : `${start.getUTCDate()}.–${end.getUTCDate()}. ${endMonth} ${year}`
  }
  const startMonth = SHORT_MONTHS_DE[start.getUTCMonth()]
  const startYear = start.getUTCFullYear() === year ? '' : ` ${start.getUTCFullYear()}`
  return `${start.getUTCDate()}. ${startMonth}${startYear}–${end.getUTCDate()}. ${endMonth} ${year}`
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

export type CampPhase = 'open' | 'preview' | 'closed' | 'past'

/**
 * Phase eines Camps für die Elternseite: vorbei (letzter Tag vorbei, Europe/Berlin),
 * Vorschau (Anmeldung startet erst), geschlossen (Anmeldefenster zu) oder offen.
 */
export function campPhase(
  camp: { end_date: string; registration_start: string | null; registration_open?: boolean },
  now: number = Date.now(),
): CampPhase {
  const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  if (camp.end_date < today) return 'past'
  if (camp.registration_start && Date.parse(camp.registration_start) > now) return 'preview'
  if (camp.registration_open === false) return 'closed'
  return 'open'
}

/** "2027-01-15T09:00:00Z" -> "15. Jan. 2027" (Europe/Berlin). */
export function formatRegistrationStart(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
}

/** Camp mit eigenem, niedrigerem Mitgliederpreis (Mitgliederliste des Vereins). */
export function campHasMemberPrice(camp: { price_cents: number; price_member_cents?: number | null }): boolean {
  return camp.price_member_cents != null && camp.price_member_cents < camp.price_cents
}

/** Kurzpreis für Karten und Leisten: bei Mitgliederpreis der niedrigste Preis mit "ab". */
export function campPriceShort(camp: { price_cents: number; price_member_cents?: number | null; currency: string }): { from: boolean; text: string } {
  return campHasMemberPrice(camp)
    ? { from: true, text: formatPrice(camp.price_member_cents as number, camp.currency) }
    : { from: false, text: formatPrice(camp.price_cents, camp.currency) }
}

/** Voller Preistext vor der Anmeldung; entschieden wird serverseitig anhand der Mitgliederliste. */
export function campPriceLong(camp: { price_cents: number; price_member_cents?: number | null; currency: string }): string {
  if (!campHasMemberPrice(camp)) return formatPrice(camp.price_cents, camp.currency)
  return `${formatPrice(camp.price_member_cents as number, camp.currency)} für Mitglieder, ${formatPrice(camp.price_cents, camp.currency)} sonst – geprüft bei der Anmeldung`
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
