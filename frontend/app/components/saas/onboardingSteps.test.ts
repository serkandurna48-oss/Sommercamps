import { describe, expect, it } from 'vitest'
import { computeOnboardingSteps, missingRequiredOrgFields } from './onboardingSteps'
import type { CampAdmin, OrganizationAdmin } from '../../lib/saasAdminApi'

const baseOrg: OrganizationAdmin = {
  id: 'org-1', slug: 'test-org', name: 'Test Org', legal_name: null,
  legal_address: '123 Main St', contact_email: 'test@example.com',
  contact_phone: null, contact_person_name: null, logo_url: null,
  primary_color: null, plan_status: 'active', theme: 'default',
  iban: null, intro_heading: null, intro_text: null,
  hero_image_url: null, trainer_image_url: null, trainer_text: null,
  terms_text: 'Bedingungen', site_published: false,
  review_status: 'draft', review_note: null,
}

const baseCamp: CampAdmin = {
  id: 'camp-1', organization_id: 'org-1', slug: 'summer', title: 'Summer',
  start_date: '2099-07-05', end_date: '2099-07-09',
  registration_start: null, registration_end: null,
  age_min: 6, age_max: 12, capacity: 20, price_cents: 10000, currency: 'EUR',
  location: null, care_info: null, meals_info: null, includes: null,
  status: 'draft',
}

function org(overrides: Partial<OrganizationAdmin> = {}): OrganizationAdmin {
  return { ...baseOrg, ...overrides } as OrganizationAdmin
}

function camp(overrides: Partial<CampAdmin> = {}): CampAdmin {
  return { ...baseCamp, ...overrides }
}

describe('computeOnboardingSteps', () => {
  it('alle Schritte offen bei leerem Verein (kein Feld, kein Camp)', () => {
    const result = computeOnboardingSteps(
      org({ contact_email: '', legal_address: null, terms_text: null }),
      []
    )
    expect(result).toEqual({ step1Done: false, step2Done: false, step3Done: false })
  })

  it('Schritt 1 erledigt, Rest offen: Pflichtfelder gesetzt, keine Camps', () => {
    const result = computeOnboardingSteps(org(), [])
    expect(result).toEqual({ step1Done: true, step2Done: false, step3Done: false })
  })

  it('Schritt 1+2 erledigt: Pflichtfelder + Entwurfs-Camp', () => {
    const result = computeOnboardingSteps(org(), [camp()])
    expect(result).toEqual({ step1Done: true, step2Done: true, step3Done: false })
  })

  it('Schritt 3 erfordert site_published UND ein veröffentlichtes Camp', () => {
    expect(computeOnboardingSteps(org({ site_published: true }), [camp()]).step3Done).toBe(false)
    expect(computeOnboardingSteps(org(), [camp({ status: 'published' })]).step3Done).toBe(false)
    expect(computeOnboardingSteps(org({ site_published: true }), [camp({ status: 'published' })]).step3Done).toBe(true)
  })

  it('Schritt 1 scheitert, wenn Pflichtfeld leer oder nur Leerzeichen', () => {
    expect(computeOnboardingSteps(org({ contact_email: '' }), []).step1Done).toBe(false)
    expect(computeOnboardingSteps(org({ legal_address: null }), []).step1Done).toBe(false)
    expect(computeOnboardingSteps(org({ terms_text: '   ' }), []).step1Done).toBe(false)
  })

  it('Schritt 3 unabhängig von Schritt 1: auch mit fehlendem Pflichtfeld möglich', () => {
    const result = computeOnboardingSteps(
      org({ site_published: true, contact_email: '' }),
      [camp({ status: 'published' })]
    )
    expect(result.step3Done).toBe(true)
    expect(result.step1Done).toBe(false)
  })

  it('Schritt 2: ein Camp mit beliebigem Status reicht', () => {
    for (const status of ['draft', 'published', 'closed', 'archived'] as const) {
      expect(computeOnboardingSteps(org(), [camp({ status })]).step2Done).toBe(true)
    }
  })

  it('Schritt 3 erkennt veröffentlichtes Camp unter mehreren', () => {
    const result = computeOnboardingSteps(
      org({ site_published: true }),
      [camp({ slug: 'a', status: 'draft' }), camp({ slug: 'b', status: 'published' })]
    )
    expect(result.step3Done).toBe(true)
  })
})

describe('missingRequiredOrgFields', () => {
  it('leeres Array, wenn alle Pflichtfelder gesetzt', () => {
    expect(missingRequiredOrgFields(org())).toEqual([])
  })

  it.each([
    [{ contact_email: '' } as Partial<OrganizationAdmin>, 'Kontakt-E-Mail'],
    [{ legal_address: null } as Partial<OrganizationAdmin>, 'Anschrift'],
    [{ terms_text: '  ' } as Partial<OrganizationAdmin>, 'Teilnahmebedingungen'],
  ])('erkennt fehlendes Feld (%#)', (override, label) => {
    expect(missingRequiredOrgFields(org(override))).toContain(label)
  })

  it('listet alle drei fehlenden Felder auf', () => {
    const missing = missingRequiredOrgFields(org({ contact_email: '', legal_address: null, terms_text: null }))
    expect(missing).toHaveLength(3)
    expect(missing).toContain('Kontakt-E-Mail')
    expect(missing).toContain('Anschrift')
    expect(missing).toContain('Teilnahmebedingungen')
  })
})
