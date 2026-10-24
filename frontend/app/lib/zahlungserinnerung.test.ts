import { describe, expect, it } from 'vitest'
import { buildOpenPaymentList, buildPaymentReminder, canCopyReminder, formatIban, reminderLabels, type ReminderEntry, type ReminderOrganization } from './zahlungserinnerung'

const org: ReminderOrganization = {
  name: 'Beispielverein', legal_name: 'Beispiel Sportverein e. V.', iban: 'DE89370400440532013000',
  contact_person_name: 'Alex Verein', contact_email: 'verein@example.com',
}
const entry: ReminderEntry = {
  registration: {
    id: 'internal-id', registration_token: 'internal-token', payment_reference: 'CP-Ab09-001 Exact',
    status: 'registered', payment_status: 'open',
    parent_first_name: 'Alex', parent_last_name: 'Beispiel', parent_email: 'alex@example.com', parent_phone: '123',
    child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '2018-05-10',
    emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
    jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
  },
  camp: {
    id: 'camp', organization_id: 'org', slug: 'sommer', title: 'Sommercamp',
    start_date: '2027-07-05', end_date: '2027-07-09', registration_start: null, registration_end: null,
    age_min: 6, age_max: 12, capacity: 20, price_cents: 14900, currency: 'EUR', status: 'published',
    location: null, care_info: null, meals_info: null, includes: null,
  },
}

describe('Zahlungserinnerung', () => {
  it.each(['DE89370400440532013000', 'DE89 3704 0044 0532 0130 00', ' DE89\n3704\t00440532013000 '])('groups IBAN in blocks of four: %s', iban => {
    expect(formatIban(iban)).toBe('DE89 3704 0044 0532 0130 00')
  })

  it('includes greeting, child, camp, dates, legal account holder and contact', () => {
    const text = buildPaymentReminder(entry, org)!
    expect(text).toMatch(/^Guten Tag Alex Beispiel,/)
    expect(text).toContain('die Zahlung für Mia für Sommercamp (5.–9. Juli 2027) ist bisher noch nicht bei uns eingegangen.')
    expect(text).toContain('Kontoinhaber: Beispiel Sportverein e. V.')
    expect(text).toContain('IBAN: DE89 3704 0044 0532 0130 00')
    expect(text).toContain('Betrag: 149,00 €')
    expect(text).toContain('Mit freundlichen Grüßen\nAlex Verein\nBeispiel Sportverein e. V.\nverein@example.com')
    expect(text).not.toContain(entry.registration.id)
    expect(text).not.toContain(entry.registration.registration_token)
  })

  it('preserves the exact payment reference, including case and whitespace', () => {
    const reference = ' CP-aB09  00-X '
    const changed = { ...entry, registration: { ...entry.registration, payment_reference: reference } }
    expect(buildPaymentReminder(changed, org)!.split('\n')).toContain(`Verwendungszweck: ${reference}`)
    expect(buildOpenPaymentList([changed])).toBe(`Alex Beispiel – Mia Muster – Sommercamp – 149,00 € – ${reference}`)
  })

  it('formats large amounts in German', () => {
    expect(buildPaymentReminder({ ...entry, camp: { ...entry.camp, price_cents: 123456 } }, org)).toContain('Betrag: 1.234,56 €')
  })

  it('uses the same fallback account holder as the parent screen and omits absent contact details', () => {
    const text = buildPaymentReminder(entry, { ...org, legal_name: null, contact_person_name: null, contact_email: '' })!
    expect(text).toContain('Kontoinhaber: Beispielverein')
    expect(text).toMatch(/Mit freundlichen Grüßen\nBeispielverein$/)
    expect(text).not.toMatch(/null|undefined/)
  })

  it.each([null, '', ' \t\n '])('disables reminder generation without IBAN: %s', iban => {
    expect(canCopyReminder(entry, { ...org, iban })).toBe(false)
    expect(buildPaymentReminder(entry, { ...org, iban })).toBeNull()
  })

  it.each([
    { status: 'cancelled', payment_status: 'open' },
    { status: 'waitlist', payment_status: 'open' },
    { status: 'registered', payment_status: 'paid' },
    { status: 'registered', payment_status: 'waived' },
    { status: 'registered', payment_status: 'refunded' },
    { status: 'registered', payment_status: 'cancelled' },
  ] as const)('excludes $status / $payment_status from reminder and bulk', statuses => {
    const excluded = { ...entry, registration: { ...entry.registration, ...statuses } }
    expect(canCopyReminder(excluded, org)).toBe(false)
    expect(buildPaymentReminder(excluded, org)).toBeNull()
    expect(buildOpenPaymentList([excluded])).toBe('')
  })

  it('builds one line per active open registration across camps without changing the input', () => {
    const second = { ...entry, camp: { ...entry.camp, title: 'Herbstcamp', price_cents: 9900 },
      registration: { ...entry.registration, status: 'confirmed' as const, payment_reference: 'CP-SECOND' } }
    const entries = [entry, second, { ...entry, registration: { ...entry.registration, payment_status: 'paid' as const } }]
    const before = JSON.stringify(entries)
    expect(buildOpenPaymentList(entries)).toBe('Alex Beispiel – Mia Muster – Sommercamp – 149,00 € – CP-Ab09-001 Exact\nAlex Beispiel – Mia Muster – Herbstcamp – 99,00 € – CP-SECOND')
    expect(JSON.stringify(entries)).toBe(before)
    expect(buildOpenPaymentList([])).toBe('')
  })

  it('uses formal German in reminder and admin texts', () => {
    expect(Object.values(reminderLabels).join(' ')).not.toMatch(/\b(du|dein|deine|dir|dich|euch|euer)\b/i)
    expect(buildPaymentReminder(entry, org)).not.toMatch(/\b(du|dein|deine|dir|dich|euch|euer)\b/i)
    expect(buildPaymentReminder(entry, org)).toContain('Bitte überweisen Sie')
  })
})
