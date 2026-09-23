import { describe, expect, it } from 'vitest'
import {
  birthYear,
  computeMoneyStats,
  countByFilter,
  filterRegistrations,
  hasMissingEmergencyContact,
  hasNotes,
} from './commandCenterLogic'
import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

function camp(overrides: Partial<CampAdmin> = {}): CampAdmin {
  return {
    id: 'camp-1',
    organization_id: 'org-1',
    slug: 'summer-1',
    title: 'Summer Camp',
    start_date: '2099-07-05',
    end_date: '2099-07-09',
    registration_start: null,
    registration_end: null,
    age_min: 6,
    age_max: 12,
    capacity: 10,
    price_cents: 10000,
    currency: 'EUR',
    location: null,
    care_info: null,
    meals_info: null,
    includes: null,
    status: 'published',
    ...overrides,
  }
}

function reg(overrides: Partial<RegistrationAdmin> = {}): RegistrationAdmin {
  return {
    id: crypto.randomUUID(),
    registration_token: crypto.randomUUID(),
    status: 'registered',
    payment_status: 'open',
    parent_first_name: 'Max',
    parent_last_name: 'Mustermann',
    parent_email: 'max@example.com',
    parent_phone: '0123',
    child_first_name: 'Lena',
    child_last_name: 'Mustermann',
    child_birth_date: '2018-03-01',
    emergency_contact_name: 'Anna',
    emergency_contact_phone: '0456',
    medical_notes: null,
    allergies: null,
    jersey_size: null,
    pickup_authorized: null,
    photo_permission: false,
    created_at: '2099-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeMoneyStats', () => {
  it('summiert bezahlt und offen getrennt, nur aktive Registrierungen', () => {
    const c = camp({ price_cents: 10000 })
    const stats = computeMoneyStats(c, [
      reg({ payment_status: 'paid', status: 'registered' }),
      reg({ payment_status: 'open', status: 'registered' }),
      reg({ payment_status: 'open', status: 'cancelled' }), // zählt nicht
      reg({ payment_status: 'paid', status: 'waitlist' }), // zählt nicht
    ])
    expect(stats.collectedCents).toBe(10000)
    expect(stats.openCents).toBe(10000)
  })
})

describe('hasMissingEmergencyContact / hasNotes', () => {
  it('erkennt fehlenden Notfallkontakt nur wenn beide Felder leer sind', () => {
    expect(hasMissingEmergencyContact(reg({ emergency_contact_name: null, emergency_contact_phone: null }))).toBe(true)
    expect(hasMissingEmergencyContact(reg({ emergency_contact_name: 'Anna', emergency_contact_phone: null }))).toBe(false)
  })

  it('erkennt Hinweise aus Allergien oder medizinischen Notizen', () => {
    expect(hasNotes(reg({ allergies: 'Nüsse' }))).toBe(true)
    expect(hasNotes(reg({ medical_notes: 'Asthma' }))).toBe(true)
    expect(hasNotes(reg({}))).toBe(false)
  })
})

describe('filterRegistrations', () => {
  const regs = [
    reg({ child_first_name: 'Lena', status: 'registered', payment_status: 'open' }),
    reg({ child_first_name: 'Tom', status: 'registered', payment_status: 'paid', emergency_contact_name: null, emergency_contact_phone: null }),
    reg({ child_first_name: 'Mia', status: 'waitlist' }),
  ]

  it('filtert nach offener Zahlung', () => {
    expect(filterRegistrations(regs, 'payment-open', '').map(r => r.child_first_name)).toEqual(['Lena'])
  })

  it('filtert nach fehlenden Angaben', () => {
    expect(filterRegistrations(regs, 'missing-info', '').map(r => r.child_first_name)).toEqual(['Tom'])
  })

  it('"Alle" zeigt jede Registrierung', () => {
    expect(filterRegistrations(regs, 'all', '')).toHaveLength(3)
  })

  it('Suche kombiniert sich mit dem Filter', () => {
    expect(filterRegistrations(regs, 'all', 'mia').map(r => r.child_first_name)).toEqual(['Mia'])
  })
})

describe('countByFilter', () => {
  it('zählt jede Kategorie unabhängig', () => {
    const regs = [
      reg({ status: 'registered', payment_status: 'open' }),
      reg({ status: 'registered', payment_status: 'open', emergency_contact_name: null, emergency_contact_phone: null }),
      reg({ status: 'waitlist' }),
    ]
    const counts = countByFilter(regs)
    expect(counts['payment-open']).toBe(2)
    expect(counts['missing-info']).toBe(1)
    expect(counts.all).toBe(3)
  })
})

describe('birthYear', () => {
  it('extrahiert das Jahr aus einem ISO-Datum', () => {
    expect(birthYear('2018-03-01')).toBe(2018)
  })
})
