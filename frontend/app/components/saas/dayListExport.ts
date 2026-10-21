import type { ExportColumn } from '../../lib/exportCsv'
import type { RegistrationAdmin } from '../../lib/saasAdminApi'
import { filterRegistrations, isActiveRegistration, type ParticipantFilter } from './commandCenterLogic'

// Dictionary order: umlauts sort with their base letter, ß with ss.
function sortKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss')
}

export function dayListRows(registrations: RegistrationAdmin[], filter: ParticipantFilter = 'all', search = '') {
  return filterRegistrations(registrations, filter, search).filter(isActiveRegistration).sort((a, b) => {
    for (const field of ['child_last_name', 'child_first_name', 'registration_token'] as const) {
      const left = sortKey(a[field])
      const right = sortKey(b[field])
      if (left !== right) return left < right ? -1 : 1
    }
    return 0
  })
}

export const DAY_LIST_COLUMNS: ExportColumn<RegistrationAdmin>[] = [
  { header: 'Kind', value: r => `${r.child_first_name} ${r.child_last_name}` },
  { header: 'Jahrgang/Alter', value: r => r.child_birth_date.slice(0, 4) },
  { header: 'Notfallkontakt Telefon', value: r => [r.emergency_contact_name, r.emergency_contact_phone].filter(Boolean).join(' · ') },
  { header: 'Abholberechtigt', value: r => r.pickup_authorized },
  { header: 'Hinweise/Allergien', value: r => [r.medical_notes, r.allergies].filter(Boolean).join(' · ') },
  { header: 'Anwesenheit', value: () => '' },
]

export function dayListCountText(count: number): string {
  return `${count} Teilnehmende · ohne Warteliste und Stornierungen`
}

export function exportFilterText(filter: ParticipantFilter, search: string): string {
  const parts = []
  if (search.trim()) parts.push(`Suche: „${search.trim()}“`)
  if (filter !== 'all') parts.push(`Filter: ${filter === 'payment-open' ? 'Zahlung offen' : 'Fehlende Notfallkontakte'}`)
  return parts.length ? `Aktiv: ${parts.join(' · ')}. Exportiert werden nur passende Treffer.` : 'Keine Suche oder Filter aktiv.'
}
