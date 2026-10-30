import { describe, expect, it } from 'vitest'
import { registrations } from '../../dev/admin-vorschau/fixtures'
import type { RegistrationAdmin, RegistrationQuestion } from '../../lib/saasAdminApi'
import { DEFAULT_PRINT_FIELDS, participantPrintFields, printColumnCost, printColumnSections, printSafeBrandColor, selectedPrintColumns } from './participantPrint'

describe('printSafeBrandColor — Kontrast auf weißem Druckpapier', () => {
  it('behält dunkle Vereinsfarben unverändert (Kontrast ≥ 4,5:1 auf Weiß)', () => {
    expect(printSafeBrandColor('#d71920')).toBe('#d71920')
    expect(printSafeBrandColor('#8a6a00')).toBe('#8a6a00')
    expect(printSafeBrandColor('#000000')).toBe('#000000')
    expect(printSafeBrandColor('#C8102E')).toBe('#C8102E')
  })
  it('ersetzt sehr helle Farben durch dunklen Fallback statt unsichtbarer Linie', () => {
    expect(printSafeBrandColor('#f5f500')).toBe('#171c19')
    expect(printSafeBrandColor('#ffff00')).toBe('#171c19')
    expect(printSafeBrandColor('#ffffff')).toBe('#171c19')
    expect(printSafeBrandColor('#f0f0f0')).toBe('#171c19')
  })
  it('gibt ungültige Hex-Werte unverändert zurück', () => {
    expect(printSafeBrandColor('invalid')).toBe('invalid')
    expect(printSafeBrandColor('')).toBe('')
    expect(printSafeBrandColor('#gg0000')).toBe('#gg0000')
  })
})

const camp = { start_date: '2027-07-05', end_date: '2027-07-09' }
const question: RegistrationQuestion = { key: 'verein', label: 'Herkunftsverein laut Anmeldung', type: 'text', options: null, other_label: null, required: false }
const fields = participantPrintFields([question])

describe('participant print field selection', () => {
  it('defaults to name/year and optional daily attendance, never contact/health/extra data', () => {
    expect(selectedPrintColumns(fields, DEFAULT_PRINT_FIELDS.participants, camp).map(c => c.header)).toEqual(['Name', 'Jahrgang'])
    expect(selectedPrintColumns(fields, DEFAULT_PRINT_FIELDS.daylist, camp).map(c => c.header)).toEqual([
      'Name', 'Jahrgang', 'Mo 05.07.', 'Di 06.07.', 'Mi 07.07.', 'Do 08.07.', 'Fr 09.07.',
    ])
  })
  it('ignores unknown, removed and duplicate IDs without falling back to all fields', () => {
    const selected = selectedPrintColumns(fields, ['unknown', 'extra:removed', 'payment', 'name', 'name'], camp)
    expect(selected.map(c => c.id)).toEqual(['name', 'payment'])
    expect(selectedPrintColumns(fields, ['unknown', 'extra:removed'], camp)).toEqual([])
    expect(selectedPrintColumns(fields, [], camp)).toEqual([])
  })
  it.each([
    ['open', 'Zahlung offen'], ['paid', 'Bezahlt'], ['refunded', 'Erstattet'], ['waived', 'Kostenlos'], ['cancelled', 'Storniert'],
  ] as const)('renders payment state %s in German', (payment_status, label) => {
    const [column] = selectedPrintColumns(fields, ['payment'], camp)
    expect(column.value({ ...registrations[0], payment_status })).toBe(label)
  })
  it('offers origin only through a configured question, preserves full labels/answers and excludes orphan answers', () => {
    expect(participantPrintFields().some(c => /verein/i.test(c.header))).toBe(false)
    const [column] = selectedPrintColumns(fields, ['extra:verein', 'extra:deleted'], camp)
    const row: RegistrationAdmin = { ...registrations[0], extra_answers: { verein: 'Testverein mit langem Namen', deleted: 'Vertrauliche Altantwort' } }
    expect(column.header).toBe(question.label)
    expect(column.value(row)).toBe('Testverein mit langem Namen')
    expect(column.value({ ...row, extra_answers: undefined })).toBeUndefined()
  })
  it('reads contact, health, status, jersey and photo permission exclusively from the row', () => {
    const row = registrations[0]
    const selected = selectedPrintColumns(fields, ['email', 'phone', 'allergies', 'medical', 'jersey', 'photo', 'status'], camp)
    expect(selected.map(c => c.value(row))).toEqual(['Angemeldet', row.jersey_size, row.parent_email, row.parent_phone, row.allergies, row.medical_notes, row.photo_permission ? 'Ja' : 'Nein'])
  })
  it('keeps default five-day and seven-day attendance together on one sheet', () => {
    expect(printColumnSections(selectedPrintColumns(fields, DEFAULT_PRINT_FIELDS.daylist, camp))).toHaveLength(1)
    expect(printColumnSections(selectedPrintColumns(fields, DEFAULT_PRINT_FIELDS.daylist, { ...camp, end_date: '2027-07-11' }))).toHaveLength(1)
  })
  it('splits wide selections without dropping columns and repeats only a selected name', () => {
    const selected = selectedPrintColumns(fields, fields.map(f => f.id), camp)
    const sections = printColumnSections(selected)
    expect(sections.length).toBeGreaterThan(1)
    expect(sections.every(section => section[0].id === 'name')).toBe(true)
    expect(sections.every(section => section.reduce((sum, c) => sum + printColumnCost(c), 0) <= 6)).toBe(true)
    expect(sections.flat().filter(c => c.id !== 'name')).toEqual(selected.filter(c => c.id !== 'name'))
    const unnamed = selected.filter(c => c.id !== 'name')
    expect(printColumnSections(unnamed).flat()).toEqual(unnamed)
    expect(printColumnSections([])).toEqual([])
  })
  // DRUCKHT 30.10.: five free-text columns on one sheet left 3 cm per column for a 300-character note.
  it('gibt Freitextspalten mehr Platz, damit lange Gesundheitsangaben nicht zu schmal werden', () => {
    const ids = ['name', 'emergency', 'pickup', 'allergies', 'medical', 'photo']
    const sections = printColumnSections(selectedPrintColumns(fields, ids, camp))
    expect(sections.length).toBeGreaterThan(1)
    expect(sections.every(section => section.filter(c => c.size === 'l').length <= 4)).toBe(true)
  })
})
