import { describe, expect, it } from 'vitest'
import type { RegistrationAdmin } from '../../lib/saasAdminApi'
import { toCsv } from '../../lib/exportCsv'
import { DAY_LIST_COLUMNS, dayListCountText, dayListRows, exportFilterText } from './dayListExport'

export const registration: RegistrationAdmin = {
  id: '1', registration_token: 'token-1', status: 'registered', payment_status: 'open',
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
