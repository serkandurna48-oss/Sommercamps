// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, describe } from 'vitest'
import OnboardingCard from './OnboardingCard'
import type { OrganizationAdmin, CampAdmin } from '../../../lib/saasAdminApi'

const orgBase: OrganizationAdmin = {
  id: 'org', slug: 'demo', name: 'Testverein', legal_name: null, legal_address: null,
  contact_email: '', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: '#116644', plan_status: 'active', theme: 'default',
  iban: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null, site_published: false,
}
const orgFull: OrganizationAdmin = {
  ...orgBase,
  contact_email: 'test@demo.example', legal_address: 'Musterstr. 1', terms_text: 'Bedingungen',
}
const campDraft: CampAdmin = {
  id: 'camp', organization_id: 'org', slug: 'herbst', title: 'Herbstcamp',
  start_date: '2026-10-25', end_date: '2026-10-30', registration_start: null,
  registration_end: null, age_min: 6, age_max: 12, capacity: 20, price_cents: 10000,
  currency: 'EUR', location: null, care_info: null, meals_info: null, includes: null,
  status: 'draft',
}

function render(org: OrganizationAdmin, camps: CampAdmin[]) {
  const html = renderToStaticMarkup(
    <OnboardingCard orgSlug="demo" org={org} camps={camps} brandStrong="#116644" brandOn="#fff" />
  )
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('OnboardingCard accessibility', () => {
  it('marks the active step with aria-current="step" and sets none on others', () => {
    const dom = render(orgBase, [])
    const steps = dom.querySelectorAll('ol > li')
    expect(steps).toHaveLength(3)
    // Step 1 is active (org incomplete)
    expect(steps[0].getAttribute('aria-current')).toBe('step')
    expect(steps[1].getAttribute('aria-current')).toBeNull()
    expect(steps[2].getAttribute('aria-current')).toBeNull()
  })

  it('moves aria-current to step 2 once step 1 is done', () => {
    const dom = render(orgFull, [])
    const steps = dom.querySelectorAll('ol > li')
    expect(steps[0].getAttribute('aria-current')).toBeNull()
    expect(steps[1].getAttribute('aria-current')).toBe('step')
    expect(steps[2].getAttribute('aria-current')).toBeNull()
  })

  it('moves aria-current to step 3 once steps 1 and 2 are done', () => {
    const dom = render(orgFull, [campDraft])
    const steps = dom.querySelectorAll('ol > li')
    expect(steps[0].getAttribute('aria-current')).toBeNull()
    expect(steps[1].getAttribute('aria-current')).toBeNull()
    expect(steps[2].getAttribute('aria-current')).toBe('step')
  })

  it('provides sr-only status text for done / active / open steps', () => {
    // Step 1 active, steps 2+3 open
    const dom = render(orgBase, [])
    const steps = dom.querySelectorAll('ol > li')
    expect(steps[0].querySelector('.sr-only')?.textContent?.trim()).toBe('aktiv')
    expect(steps[1].querySelector('.sr-only')?.textContent?.trim()).toBe('offen')
    expect(steps[2].querySelector('.sr-only')?.textContent?.trim()).toBe('offen')
  })

  it('marks done steps with sr-only "erledigt"', () => {
    // Step 1 done, step 2 active, step 3 open
    const dom = render(orgFull, [])
    const steps = dom.querySelectorAll('ol > li')
    expect(steps[0].querySelector('.sr-only')?.textContent?.trim()).toBe('erledigt')
    expect(steps[1].querySelector('.sr-only')?.textContent?.trim()).toBe('aktiv')
    expect(steps[2].querySelector('.sr-only')?.textContent?.trim()).toBe('offen')
  })
})
