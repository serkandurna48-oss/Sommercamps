import { describe, expect, it } from 'vitest'
import { computeSetupSteps, setupProgressCount } from './setupProgress'
import type { OrganizationAdmin } from '../lib/saasAdminApi'

function org(overrides: Partial<OrganizationAdmin> = {}): OrganizationAdmin {
  return {
    id: 'org-1',
    slug: 'demo-fc',
    name: 'Demo FC',
    legal_name: null,
    contact_email: 'demo@example.com',
    contact_phone: null,
    contact_person_name: null,
    logo_url: null,
    primary_color: null,
    plan_status: 'pilot',
    theme: 'tradition',
    iban: null,
    intro_heading: null,
    intro_text: null,
    hero_image_url: null,
    billing_notes: null,
    site_published: false,
    ...overrides,
  }
}

describe('computeSetupSteps', () => {
  it('marks everything undone for a bare-minimum org with no camp', () => {
    const steps = computeSetupSteps(org(), 0)
    expect(setupProgressCount(steps)).toEqual({ done: 0, total: 5 })
  })

  it('marks all five steps done once every signal is present', () => {
    const complete = org({
      contact_person_name: 'Anna Beispiel',
      logo_url: '/logo.svg',
      intro_heading: 'Willkommen',
      site_published: true,
    })
    const steps = computeSetupSteps(complete, 1)
    expect(setupProgressCount(steps)).toEqual({ done: 5, total: 5 })
  })

  it('accepts primary_color alone as satisfying the Marke step', () => {
    const steps = computeSetupSteps(org({ primary_color: '#1c6b45' }), 0)
    expect(steps.find(s => s.id === 'marke')?.done).toBe(true)
  })

  it('camp step depends on the passed-in camp count, not org fields', () => {
    const steps = computeSetupSteps(org(), 3)
    expect(steps.find(s => s.id === 'camp')?.done).toBe(true)
  })

  it('every step carries an editPath under the org slug', () => {
    const steps = computeSetupSteps(org({ slug: 'tv-musterstadt' }), 0)
    for (const step of steps) {
      expect(step.editPath).toContain('tv-musterstadt')
    }
  })
})
