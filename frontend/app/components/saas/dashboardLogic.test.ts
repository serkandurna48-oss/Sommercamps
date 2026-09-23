import { describe, expect, it } from 'vitest'
import { buildTasks, computeCampStats, pickNextCamp } from './dashboardLogic'
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
    child_birth_date: '2018-01-01',
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

describe('computeCampStats', () => {
  it('zählt registered/confirmed als belegt, waitlist getrennt', () => {
    const stats = computeCampStats(camp(), [
      reg({ status: 'registered' }),
      reg({ status: 'confirmed' }),
      reg({ status: 'waitlist' }),
      reg({ status: 'cancelled' }),
    ])
    expect(stats.registeredCount).toBe(2)
    expect(stats.waitlistCount).toBe(1)
  })

  it('zählt offene Zahlungen nur unter aktiven Registrierungen', () => {
    const stats = computeCampStats(camp(), [
      reg({ status: 'registered', payment_status: 'open' }),
      reg({ status: 'registered', payment_status: 'paid' }),
      reg({ status: 'waitlist', payment_status: 'open' }), // zählt nicht
    ])
    expect(stats.openPaymentsCount).toBe(1)
  })

  it('erkennt fehlenden Notfallkontakt nur bei aktiven Registrierungen', () => {
    const stats = computeCampStats(camp(), [
      reg({ status: 'registered', emergency_contact_name: null, emergency_contact_phone: null }),
      reg({ status: 'registered', emergency_contact_name: 'Anna', emergency_contact_phone: null }),
    ])
    expect(stats.missingEmergencyContactCount).toBe(1)
  })
})

describe('pickNextCamp', () => {
  it('wählt den veröffentlichten Camp mit dem frühesten Startdatum in der Zukunft', () => {
    const c1 = computeCampStats(camp({ slug: 'later', start_date: '2099-08-01', end_date: '2099-08-05' }), [])
    const c2 = computeCampStats(camp({ slug: 'sooner', start_date: '2099-07-01', end_date: '2099-07-05' }), [])
    expect(pickNextCamp([c1, c2])?.camp.slug).toBe('sooner')
  })

  it('ignoriert Entwürfe und vergangene Camps', () => {
    const draft = computeCampStats(camp({ slug: 'draft', status: 'draft', start_date: '2099-01-01', end_date: '2099-01-02' }), [])
    const past = computeCampStats(camp({ slug: 'past', start_date: '2000-01-01', end_date: '2000-01-02' }), [])
    expect(pickNextCamp([draft, past])).toBeNull()
  })

  it('gibt null zurück, wenn kein Camp ansteht', () => {
    expect(pickNextCamp([])).toBeNull()
  })
})

describe('buildTasks', () => {
  it('priorisiert Zahlung vor fehlenden Angaben vor Warteliste', () => {
    const stats = computeCampStats(camp(), [
      reg({ status: 'waitlist' }),
      reg({ status: 'registered', payment_status: 'open' }),
      reg({ status: 'registered', emergency_contact_name: null, emergency_contact_phone: null }),
    ])
    const tasks = buildTasks([stats])
    expect(tasks.map(t => t.kind)).toEqual(['payment', 'missing-contact', 'waitlist'])
  })

  it('erzeugt keinen Task, wenn nichts ansteht', () => {
    const stats = computeCampStats(camp(), [reg({ status: 'registered', payment_status: 'paid' })])
    expect(buildTasks([stats])).toEqual([])
  })
})
