import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function berlinDay(date: Date): string {
  return dayFormatter.format(date)
}

export function registrationTime(createdAt: string): string {
  return timeFormatter.format(new Date(createdAt))
}

export function registrationDate(createdAt: string): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? 'Unbekannt' : dateFormatter.format(date)
}

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
