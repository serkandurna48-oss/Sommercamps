import type { ExportColumn } from '../../lib/exportCsv'
import { paymentStatusLabel, registrationStatusLabel } from '../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../lib/saasAdminApi'
import { campAttendanceColumns } from './dayListExport'

export type PrintPurpose = 'daylist' | 'participants'
export interface ParticipantPrintField extends ExportColumn<RegistrationAdmin> {
  id: string
  group: 'Teilnahme' | 'Kontakt und Betreuung' | 'Zusatzfragen'
  attendance?: boolean
  /** Column width on paper: s = short values (year, size), l = names and free text. */
  size?: 's' | 'm' | 'l'
  /** Safety-relevant for trainers: filled values are printed emphasized. */
  alert?: boolean
}

export const DEFAULT_PRINT_FIELDS: Record<PrintPurpose, string[]> = {
  daylist: ['name', 'year', 'attendance'],
  participants: ['name', 'year'],
}

/** Only explicit fields from the existing admin contract are offered. */
export function participantPrintFields(questions: RegistrationQuestion[] = []): ParticipantPrintField[] {
  return [
    { id: 'name', header: 'Name', group: 'Teilnahme', size: 'l', value: r => `${r.child_first_name} ${r.child_last_name}` },
    { id: 'year', header: 'Jahrgang', group: 'Teilnahme', size: 's', value: r => r.child_birth_date.slice(0, 4) },
    { id: 'status', header: 'Anmeldestatus', group: 'Teilnahme', size: 'm', value: r => registrationStatusLabel[r.status] ?? r.status },
    { id: 'payment', header: 'Zahlungsstatus', group: 'Teilnahme', size: 'm', value: r => paymentStatusLabel[r.payment_status] ?? r.payment_status },
    { id: 'jersey', header: 'Trikotgröße', group: 'Teilnahme', size: 's', value: r => r.jersey_size },
    { id: 'attendance', header: 'Anwesenheit je Camptag', group: 'Teilnahme', attendance: true, value: () => '' },
    { id: 'parent', header: 'Elternteil', group: 'Kontakt und Betreuung', size: 'm', value: r => `${r.parent_first_name} ${r.parent_last_name}` },
    { id: 'email', header: 'E-Mail', group: 'Kontakt und Betreuung', size: 'l', value: r => r.parent_email },
    { id: 'phone', header: 'Telefon', group: 'Kontakt und Betreuung', size: 'm', value: r => r.parent_phone },
    { id: 'emergency', header: 'Notfallkontakt', group: 'Kontakt und Betreuung', size: 'l', value: r => [r.emergency_contact_name, r.emergency_contact_phone].filter(Boolean).join(' · ') },
    { id: 'pickup', header: 'Abholberechtigt', group: 'Kontakt und Betreuung', size: 'l', value: r => r.pickup_authorized },
    { id: 'allergies', header: 'Allergien', group: 'Kontakt und Betreuung', size: 'l', alert: true, value: r => r.allergies },
    { id: 'medical', header: 'Medizinische Hinweise', group: 'Kontakt und Betreuung', size: 'l', alert: true, value: r => r.medical_notes },
    { id: 'photo', header: 'Fotoerlaubnis', group: 'Kontakt und Betreuung', size: 's', value: r => r.photo_permission ? 'Ja' : 'Nein' },
    ...questions.map(q => ({
      id: `extra:${q.key}`, header: q.label, group: 'Zusatzfragen' as const, size: 'm' as const,
      value: (r: RegistrationAdmin) => r.extra_answers?.[q.key],
    })),
  ]
}

/** Unknown or stale IDs never select data; catalogue order stays stable. */
export function selectedPrintColumns(fields: ParticipantPrintField[], selected: readonly string[], camp: Pick<CampAdmin, 'start_date' | 'end_date'>): ParticipantPrintField[] {
  const ids = new Set(selected)
  return fields.filter(field => ids.has(field.id)).flatMap(field => field.attendance
    ? campAttendanceColumns(camp.start_date, camp.end_date).map((column, i) => ({ ...field, ...column, id: `attendance:${i}` }))
    : [field])
}

/** Keep A4 text readable. Attendance cells need only half a text column.
 * Repeat the name only when selected; row numbers link every section. */
export function printColumnSections(columns: ParticipantPrintField[]): ParticipantPrintField[][] {
  const name = columns.find(column => column.id === 'name')
  const sections: ParticipantPrintField[][] = []
  let current: ParticipantPrintField[] = []
  let width = 0
  for (const column of columns) {
    const cost = column.attendance ? 0.5 : 1
    if (width + cost > 6) {
      sections.push(current)
      current = name ? [name] : []
      width = current.length
    }
    current.push(column)
    width += cost
  }
  if (current.length) sections.push(current)
  return sections
}
