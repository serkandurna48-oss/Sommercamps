// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import DoneScreen from './DoneScreen'

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('../../lib/saasApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/saasApi')>(),
  getStripePaymentAvailability: vi.fn(async () => true),
  createStripeCheckout: vi.fn(),
}))

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein', theme: 'tradition', legal_name: 'Testverein e. V.', legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.de', contact_phone: null, logo_url: null,
  primary_color: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null, iban: null,
}
const camp: CampPublic = {
  slug: 'wintercamp', title: 'Wintercamp', start_date: '2027-12-29', end_date: '2027-12-31',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12, capacity: 20,
  price_cents: 14900, currency: 'EUR', registration_open: true, location: null, care_info: null,
  meals_info: null, includes: null, registered_count: 1, waitlist_count: 0, spots_remaining: 19, is_full: false,
}
const result: RegistrationCreated = { registration_token: 'tok', status: 'registered', payment_status: 'open', payment_reference: 'CP-1' }
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it('nennt CampsPilot als Zahlungsempfänger im Auftrag des Vereins (Sie-Form)', async () => {
  await act(async () => root.render(<DoneScreen org={org} camp={camp} result={result} childName="Mia" parentEmail="eva@example.de" onBackToOrg={() => {}} />))
  expect(host.textContent).toContain('Sicher per Karte über Stripe. Zahlungsempfänger ist CampsPilot im Auftrag von Testverein e. V.')
  expect(host.textContent).not.toContain('geht direkt an')
})
