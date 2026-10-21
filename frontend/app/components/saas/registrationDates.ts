import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

import { berlinDay } from '../../lib/i18n/de'
export { berlinDay, formatTime as registrationTime, formatDateTime as registrationDate } from '../../lib/i18n/de'

export type ParticipantSort = 'newest' | 'name'

export function sortRegistrations(registrations: RegistrationAdmin[], sort: ParticipantSort): RegistrationAdmin[] {
  return [...registrations].sort((a, b) => sort === 'newest'
    ? (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
    : `${a.child_last_name} ${a.child_first_name}`.localeCompare(`${b.child_last_name} ${b.child_first_name}`, 'de'))
}

export interface TodayEntry {
  registration: RegistrationAdmin
  camp: CampAdmin
}

/** Calendar-day comparison is independent of the server timezone, including DST. */
export function todayRegistrations(camps: CampAdmin[], registrationsByCamp: RegistrationAdmin[][], now = new Date()): TodayEntry[] {
  const today = berlinDay(now)
  return camps.flatMap((camp, index) => (registrationsByCamp[index] ?? []).flatMap(registration => {
    const created = new Date(registration.created_at)
    return !Number.isNaN(created.getTime()) && created <= now && berlinDay(created) === today
      ? [{ camp, registration }] : []
  })).sort((a, b) => Date.parse(b.registration.created_at) - Date.parse(a.registration.created_at))
}
