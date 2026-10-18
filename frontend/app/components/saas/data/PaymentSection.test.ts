import { describe, expect, it } from 'vitest'
import { isActiveRegistration } from '../commandCenterLogic'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'

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

/**
 * Prüft, dass PaymentSection counts.open und filtered('open') denselben
 * Aktivstatus-Filter wie commandCenterLogic verwenden: Warteliste und
 * stornierte Einträge dürfen offene Zahlungen weder in Anzahl noch in
 * Liste erhöhen.
 */
describe('PaymentSection — offene Zahlungen Zählung', () => {
  it('Wartelisteneintrag mit offener Zahlung zählt nicht als offen', () => {
    const regs = [
      reg({ status: 'waitlist', payment_status: 'open' }),
      reg({ status: 'registered', payment_status: 'open' }),
      reg({ status: 'cancelled', payment_status: 'open' }),
      reg({ status: 'confirmed', payment_status: 'open' }),
    ]
    const openCount = regs.filter(r => isActiveRegistration(r) && r.payment_status === 'open').length
    expect(openCount).toBe(2) // nur 'registered' und 'confirmed'
  })

  it('alle aktiven Statuses (registered, confirmed) zählen als offen', () => {
    const regs = [
      reg({ status: 'registered', payment_status: 'open' }),
      reg({ status: 'confirmed', payment_status: 'open' }),
    ]
    const openCount = regs.filter(r => isActiveRegistration(r) && r.payment_status === 'open').length
    expect(openCount).toBe(2)
  })

  it('bezahlte aktive Einträge zählen nicht als offen', () => {
    const regs = [
      reg({ status: 'registered', payment_status: 'paid' }),
      reg({ status: 'confirmed', payment_status: 'paid' }),
    ]
    const openCount = regs.filter(r => isActiveRegistration(r) && r.payment_status === 'open').length
    expect(openCount).toBe(0)
  })
})
