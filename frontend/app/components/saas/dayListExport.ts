import type { ExportColumn } from '../../lib/exportCsv'
import type { RegistrationAdmin, RegistrationQuestion } from '../../lib/saasAdminApi'
import { filterRegistrations, isActiveRegistration, type ParticipantFilter } from './commandCenterLogic'

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const

export function campAttendanceColumns(startDate: string, endDate: string): ExportColumn<RegistrationAdmin>[] {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const numDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (numDays < 1 || numDays > 7) return [{ header: 'Anwesend', value: () => '' }]
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date(sy, sm - 1, sd + i)
    const day = WEEKDAYS[d.getDay()]
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return { header: `${day} ${dd}.${mm}.`, value: (): string => '' }
  })
}

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

const MAX_PRINT_EXTRA = 3

function truncateLabel(label: string): string {
  return label.length > 14 ? label.slice(0, 13) + '…' : label
}

function answerOrDash(r: RegistrationAdmin, key: string): string {
  return (r.extra_answers?.[key] ?? '') || '–'
}

/** Builds extra-question columns for print lists (DayListPrint, ParticipantListPrint).
 * First 3 questions get individual narrow columns; 4+ overflow and orphaned
 * (deleted) answers appear in a single "Weitere" column. */
export function buildPrintExtraColumns(questions: RegistrationQuestion[]): ExportColumn<RegistrationAdmin>[] {
  const knownKeys = new Set(questions.map(q => q.key))

  const mainCols = questions.slice(0, MAX_PRINT_EXTRA).map(q => ({
    header: truncateLabel(q.label),
    title: q.label,
    value: (r: RegistrationAdmin) => answerOrDash(r, q.key),
  }))

  if (questions.length <= MAX_PRINT_EXTRA) return mainCols

  const overflow = questions.slice(MAX_PRINT_EXTRA)
  const weiter: ExportColumn<RegistrationAdmin> = {
    header: 'Weitere',
    title: 'Weitere Zusatzfragen',
    value: (r: RegistrationAdmin) => {
      const parts: string[] = overflow.map(q => `${q.label}: ${answerOrDash(r, q.key)}`)
      for (const [k, v] of Object.entries(r.extra_answers ?? {})) {
        if (!knownKeys.has(k)) parts.push(`${k}: ${v || '–'}`)
      }
      return parts.join('; ')
    },
  }

  return [...mainCols, weiter]
}

export function dayListCountText(count: number): string {
  return `${count} Teilnehmende · ohne Warteliste und Stornierungen`
}

export function exportFilterText(filter: ParticipantFilter, search: string): string {
  const parts = []
  if (search.trim()) parts.push(`Suche: „${search.trim()}“`)
  if (filter !== 'all') parts.push(`Filter: ${filter === 'payment-open' ? 'Zahlung offen' : 'Fehlende Notfallkontakte'}`)
  return parts.length ? `Aktiv: ${parts.join(' · ')}. Exportiert werden nur passende Treffer.` : 'Keine Suche oder Filter aktiv.'
}
