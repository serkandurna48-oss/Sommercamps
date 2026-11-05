import { formatPrice } from './parentFlowFormat'
import type { CampPublic, TrainingOfferPublic, TrainingSessionPublic } from './saasApi'

/**
 * Reine Hilfen für die öffentlichen Trainingsseiten. Zeiten kommen als
 * Berliner local_date/local_time vom Server und werden nie aus UTC neu berechnet.
 */

const WEEKDAYS_SHORT = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']

/** 3500 -> "35 €", 3550 -> "35,50 €". */
export function euroText(cents: number): string {
  const amount = cents % 100 === 0
    ? String(cents / 100)
    : (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${amount} €`
}

/**
 * Preisanzeige vor der Buchung. Bei gleichen Preisen nur der Preis, damit
 * kein Mitgliedschaftshinweis ohne Wirkung erscheint.
 */
export function memberPriceText(memberCents: number, nonMemberCents: number): string {
  if (memberCents === nonMemberCents) return euroText(nonMemberCents)
  return `${euroText(memberCents)} für Mitglieder, ${euroText(nonMemberCents)} sonst – geprüft bei der Buchung`
}

/** "Do., 12. Nov. 2026, 16:00 Uhr" aus Berliner Datum "YYYY-MM-DD" und Zeit "HH:MM[:SS]". */
export function formatSessionDateTime(localDate: string, localTime: string): string {
  const [y, m, d] = localDate.split('-').map(Number)
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday}, ${d}. ${MONTHS_SHORT[m - 1]} ${y}, ${localTime.slice(0, 5)} Uhr`
}

export function sessionAvailability(session: { capacity: number; free_spots: number }): { bookable: boolean; label: string } {
  if (session.free_spots <= 0) return { bookable: false, label: 'ausgebucht' }
  if (session.capacity === 1) return { bookable: true, label: 'Platz frei' }
  return { bookable: true, label: `${session.free_spots} ${session.free_spots === 1 ? 'Platz' : 'Plätze'} frei` }
}

/** Preis der Bestätigungsseite: ausschließlich der vom Server berechnete Preis. */
export function bookingPriceText(result: { applied_price_cents?: number | null }): string | null {
  const cents = result.applied_price_cents
  return typeof cents === 'number' ? formatPrice(cents, 'EUR') : null
}

export type TrainingConflict = 'full' | 'past' | 'duplicate'

/** Unterscheidet die 409-Antworten des Backends anhand ihres Textes. */
export function trainingConflictKind(detail: unknown): TrainingConflict {
  if (typeof detail !== 'string') return 'duplicate'
  if (detail.includes('belegt')) return 'full'
  if (detail.includes('Vergangenheit')) return 'past'
  return 'duplicate'
}

export function trainingSubmitErrorMessage(status: number, conflict?: TrainingConflict): string {
  if (status === 0) return 'Die Verbindung zum Server ist fehlgeschlagen; der Buchungsstatus ist unklar. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.'
  if (status === 404) return 'Dieser Termin ist nicht mehr verfügbar. Bitte wählen Sie einen anderen Termin.'
  if (status === 409) {
    if (conflict === 'full') return 'Dieser Termin wurde gerade vergeben. Bitte wählen Sie einen anderen Termin.'
    if (conflict === 'past') return 'Dieser Termin ist nicht mehr buchbar. Bitte wählen Sie einen anderen Termin.'
    return 'Für dieses Kind liegt für diesen Termin bereits eine Buchung vor. Bitte wenden Sie sich bei Fragen an den Verein.'
  }
  if (status === 422) return 'Die Buchung konnte mit diesen Angaben nicht abgeschlossen werden. Bitte prüfen Sie Ihre Angaben, insbesondere das Alter Ihres Kindes.'
  if (status === 429) return 'Es wurden zu viele Buchungsversuche in kurzer Zeit gesendet. Bitte warten Sie einen Moment und versuchen Sie es erneut.'
  return 'Der Server konnte die Buchung nicht bestätigen; der Buchungsstatus ist unklar. Bitte versuchen Sie es später erneut.'
}

export function findBookableSession<T extends { slug: string; capacity: number; free_spots: number }>(
  sessions: T[], slug: string | null,
): T | null {
  if (!slug) return null
  const found = sessions.find(session => session.slug === slug)
  return found && sessionAvailability(found).bookable ? found : null
}

/**
 * Bildet Angebot + Termin auf das Camp-Modell des Anmeldeformulars ab. Der
 * Preis bleibt bewusst 0: angezeigt wird nur der Preistext, bezahlt wird der
 * vom Server berechnete Preis.
 */
export function sessionAsCamp(
  offer: Pick<TrainingOfferPublic, 'title' | 'location'>,
  session: TrainingSessionPublic,
): CampPublic {
  return {
    slug: session.slug,
    title: offer.title,
    start_date: session.local_date,
    end_date: session.local_date,
    registration_start: null,
    registration_end: null,
    age_min: session.age_min,
    age_max: session.age_max,
    capacity: session.capacity,
    price_cents: 0,
    currency: 'EUR',
    registration_open: true,
    location: offer.location,
    care_info: null,
    meals_info: null,
    includes: null,
    registered_count: session.capacity - session.free_spots,
    waitlist_count: 0,
    spots_remaining: session.free_spots,
    is_full: false,
  }
}
