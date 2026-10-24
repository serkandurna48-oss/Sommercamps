import { describe, expect, it } from 'vitest'
import type { RegistrationAdmin, RegistrationQuestion } from '../../lib/saasAdminApi'
import { toCsv } from '../../lib/exportCsv'
import { buildPrintExtraColumns, campAttendanceColumns, DAY_LIST_COLUMNS, dayListCountText, dayListRows, exportFilterText } from './dayListExport'

export const registration: RegistrationAdmin = {
  id: '1', registration_token: 'token-1', payment_reference: 'CP-TOKEN-1', status: 'registered', payment_status: 'open',
  parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'test@example.com', parent_phone: '123',
  child_first_name: 'Lena', child_last_name: 'Zimmer', child_birth_date: '2018-05-10',
  emergency_contact_name: 'Anna', emergency_contact_phone: '0123', medical_notes: 'Hinweis', allergies: 'Nüsse',
  jersey_size: null, pickup_authorized: 'Oma', photo_permission: false, created_at: '2027-01-01T00:00:00Z',
}

describe('Camp-Tagesliste', () => {
  it('includes only registered/confirmed, alphabetically by surname then first name', () => {
    const rows = [registration,
      { ...registration, status: 'waitlist' as const },
      { ...registration, status: 'cancelled' as const },
      { ...registration, status: 'confirmed' as const, child_first_name: 'Ben', child_last_name: 'Äbel' },
      { ...registration, child_first_name: 'Anna', child_last_name: 'Äbel' }]
    expect(dayListRows(rows).map(r => `${r.child_first_name} ${r.child_last_name}`)).toEqual(['Anna Äbel', 'Ben Äbel', 'Lena Zimmer'])
    expect(rows[0]).toBe(registration)
  })
  it('respects search and payment/missing-info filters without reintroducing inactive children', () => {
    const rows = [registration, { ...registration, payment_status: 'paid' as const, child_first_name: 'Ben' },
      { ...registration, emergency_contact_name: null, emergency_contact_phone: null, child_first_name: 'Anna' }]
    expect(dayListRows(rows, 'payment-open', ' LENA ')).toEqual([registration])
    expect(dayListRows(rows, 'payment-open', 'Ben')).toEqual([])
    expect(dayListRows(rows, 'missing-info').map(r => r.child_first_name)).toEqual(['Anna'])
    expect(dayListRows(rows, 'all', 'unbekannt')).toEqual([])
  })
  it('describes the exact count, exclusions and active filters', () => {
    expect(dayListCountText(2)).toBe('2 Teilnehmende · ohne Warteliste und Stornierungen')
    expect(dayListCountText(0)).toBe('0 Teilnehmende · ohne Warteliste und Stornierungen')
    expect(exportFilterText('payment-open', ' Lena ')).toBe('Aktiv: Suche: „Lena“ · Filter: Zahlung offen. Exportiert werden nur passende Treffer.')
  })
  it('exports the six requested columns with blank attendance and no parent email', () => {
    expect(toCsv([registration], DAY_LIST_COLUMNS)).toBe(
      'Kind;Jahrgang/Alter;Notfallkontakt Telefon;Abholberechtigt;Hinweise/Allergien;Anwesenheit\r\nLena Zimmer;2018;Anna · 0123;Oma;Hinweis · Nüsse;',
    )
  })
})

const ksvQuestions: RegistrationQuestion[] = [
  { key: 'position', label: 'Position', type: 'choice', options: ['Feldspieler', 'Torwart'], other_label: null, required: false },
  { key: 'verein', label: 'Verein', type: 'choice', options: ['KSV Baunatal'], other_label: 'Anderer Verein', required: false },
]

const regWithExtras: RegistrationAdmin = {
  ...registration,
  extra_answers: { position: 'Feldspieler', verein: 'KSV Baunatal' },
}

describe('buildPrintExtraColumns', () => {
  it('KSV: Position + Verein → 2 columns with correct values (covers both DayListPrint and ParticipantListPrint)', () => {
    const cols = buildPrintExtraColumns(ksvQuestions)
    expect(cols).toHaveLength(2)
    expect(cols[0].header).toBe('Position')
    expect(cols[0].title).toBe('Position')
    expect(cols[0].value(regWithExtras)).toBe('Feldspieler')
    expect(cols[1].header).toBe('Verein')
    expect(cols[1].title).toBe('Verein')
    expect(cols[1].value(regWithExtras)).toBe('KSV Baunatal')
  })

  it('5 questions → 3 individual columns + "Weitere"', () => {
    const fiveQs: RegistrationQuestion[] = Array.from({ length: 5 }, (_, i) => ({
      key: `q${i + 1}`, label: `Frage ${i + 1}`, type: 'text' as const, options: null, other_label: null, required: false,
    }))
    const cols = buildPrintExtraColumns(fiveQs)
    expect(cols).toHaveLength(4)
    expect(cols.map(c => c.header)).toEqual(['Frage 1', 'Frage 2', 'Frage 3', 'Weitere'])
  })

  it('empty answer renders as "–"', () => {
    const noAnswer: RegistrationAdmin = { ...registration, extra_answers: { position: '', verein: 'KSV Baunatal' } }
    const noExtras: RegistrationAdmin = { ...registration, extra_answers: {} }
    const cols = buildPrintExtraColumns(ksvQuestions)
    expect(cols[0].value(noAnswer)).toBe('–')
    expect(cols[0].value(noExtras)).toBe('–')
    expect(cols[0].value(registration)).toBe('–')
  })

  it('deleted question appears in Weitere with its key as label', () => {
    const fiveQs: RegistrationQuestion[] = Array.from({ length: 5 }, (_, i) => ({
      key: `q${i + 1}`, label: `Frage ${i + 1}`, type: 'text' as const, options: null, other_label: null, required: false,
    }))
    const fourQs = fiveQs.slice(0, 4)
    const r: RegistrationAdmin = { ...registration, extra_answers: { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'orphan' } }
    const cols = buildPrintExtraColumns(fourQs)
    const weiter = cols.find(c => c.header === 'Weitere')!
    const val = weiter.value(r)
    expect(val).toContain('Frage 4: d')
    expect(val).toContain('q5: orphan')
  })

  it('mutation probe: column order follows registration_questions order — reversing input reverses headers', () => {
    const cols = buildPrintExtraColumns(ksvQuestions)
    const reversed = buildPrintExtraColumns([...ksvQuestions].reverse())
    expect(cols.map(c => c.header)).toEqual(['Position', 'Verein'])
    expect(reversed.map(c => c.header)).toEqual(['Verein', 'Position'])
  })
})

describe('campAttendanceColumns', () => {
  it('4-day camp yields exactly 4 columns', () => {
    const cols = campAttendanceColumns('2027-07-05', '2027-07-08')
    expect(cols).toHaveLength(4)
    expect(cols.every(c => c.value({} as never) === '')).toBe(true)
  })
  it('1-day camp yields 1 column', () => {
    expect(campAttendanceColumns('2027-07-05', '2027-07-05')).toHaveLength(1)
  })
  it('7-day camp yields 7 columns', () => {
    expect(campAttendanceColumns('2027-07-05', '2027-07-11')).toHaveLength(7)
  })
  it('>7 days yields a single Anwesend column', () => {
    const cols = campAttendanceColumns('2027-07-01', '2027-07-15')
    expect(cols).toHaveLength(1)
    expect(cols[0].header).toBe('Anwesend')
  })
  it('mutation probe: 2027-07-05 is a Monday — off-by-one in date or weekday shifts the header', () => {
    const cols = campAttendanceColumns('2027-07-05', '2027-07-08')
    // 2027-07-05 = Monday (Mo), 06 = Tuesday (Di), 07 = Wednesday (Mi), 08 = Thursday (Do)
    expect(cols.map(c => c.header)).toEqual(['Mo 05.07.', 'Di 06.07.', 'Mi 07.07.', 'Do 08.07.'])
  })
})
