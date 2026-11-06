import type { CampAdmin, RegistrationAdmin, TrainingOffer, TrainingSessionAdmin } from '../../../lib/saasAdminApi'

/** Ein Trainingstermin samt Buchungen für die Zahlungsseite. */
export interface TrainingPaymentGroup {
  camp: CampAdmin
  registrations: RegistrationAdmin[]
}

function germanDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-')
  return `${d}.${m}.${y}`
}

/** Bildet einen Termin als „Camp“-Zeile ab, damit Zahlungsliste, Erinnerungstexte und
 * Summen unverändert funktionieren. Datum/Uhrzeit kommen als Berliner Ortszeit aus der
 * API (`local_date`/`local_time`), nie aus `starts_at` im Browser gerechnet. Der Preis
 * einer Buchung ist `applied_price_cents`; `price_cents` ist nur der Rückfall. */
export function trainingPaymentGroup(
  offer: Pick<TrainingOffer, 'id' | 'title'>,
  session: TrainingSessionAdmin,
  registrations: RegistrationAdmin[],
): TrainingPaymentGroup {
  const camp: CampAdmin = {
    id: session.id,
    organization_id: '',
    slug: session.slug,
    title: `${offer.title} · ${germanDate(session.local_date)}, ${session.local_time} Uhr`,
    start_date: session.local_date,
    end_date: session.local_date,
    registration_start: null,
    registration_end: null,
    age_min: session.age_min,
    age_max: session.age_max,
    capacity: session.capacity,
    price_cents: session.price_nonmember_cents,
    currency: 'EUR',
    location: session.location,
    care_info: null,
    meals_info: null,
    includes: null,
    status: session.status,
  }
  return { camp, registrations }
}
