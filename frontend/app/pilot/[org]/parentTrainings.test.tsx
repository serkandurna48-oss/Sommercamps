import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  fetchCamps, fetchOrganization, fetchTrainingOffers,
  type CampPublic, type OrganizationPublic, type TrainingOfferListItem,
} from '../../lib/saasApi'
import PilotOrgPage from './page'

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({ publicFontClassName: (theme: string) => `font-${theme}` }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))
vi.mock('../../lib/saasApi', async (original) => ({
  ...await original<typeof import('../../lib/saasApi')>(),
  fetchOrganization: vi.fn(), fetchCamps: vi.fn(), fetchTrainingOffers: vi.fn(),
}))

const org: OrganizationPublic = {
  modules: ['camps', 'trainings', 'members'],
  slug: 'testverein', name: 'Testverein', theme: 'akademie', primary_color: '#e1b650',
  logo_url: '/test-logo.svg', contact_email: 'camps@example.org', contact_phone: null,
  legal_name: null, legal_address: null, contact_person_name: null, intro_heading: null,
  intro_text: null, hero_image_url: null, trainer_image_url: null, trainer_text: null,
  terms_text: null, iban: null,
}
const camp: CampPublic = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2099-07-05', end_date: '2099-07-09',
  registration_start: null, registration_end: null, registration_open: true,
  age_min: 6, age_max: 12, capacity: 20, price_cents: 12000, currency: 'EUR',
  location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 10, spots_remaining: 10, waitlist_count: 0, is_full: false,
}
const offer: TrainingOfferListItem = {
  slug: 'torwart', title: 'Torwarttraining', kind: 'einzel', description: null,
  duration_minutes: 60, location: null, price_member_cents: 3000, price_nonmember_cents: 3500,
  from_price_member_cents: 3000, from_price_nonmember_cents: 3000,
}
const groupOffer: TrainingOfferListItem = {
  ...offer, slug: 'gruppe', title: 'Kleingruppe', kind: 'gruppe', duration_minutes: 90,
  from_price_member_cents: null, from_price_nonmember_cents: null,
}

const render = async () => renderToStaticMarkup(await PilotOrgPage({ params: Promise.resolve({ org: org.slug }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchOrganization).mockResolvedValue(org)
  vi.mocked(fetchCamps).mockResolvedValue([camp])
  vi.mocked(fetchTrainingOffers).mockResolvedValue([])
})

it('zeigt veröffentlichte Trainings mit Art, Dauer, Preis und Link', async () => {
  vi.mocked(fetchTrainingOffers).mockResolvedValue([offer, groupOffer])
  const html = await render()
  expect(html).toContain('>Trainings<')
  expect(html).toContain('href="/pilot/testverein/training/torwart"')
  expect(html).toContain('href="/pilot/testverein/training/gruppe"')
  expect(html).toContain('Torwarttraining')
  expect(html).toContain('Einzeltraining · 60 Minuten')
  expect(html).toContain('Gruppentraining · 90 Minuten')
  expect(html).toContain('ab 30 €')
})

it('blendet den Trainingsbereich ohne Angebote aus', async () => {
  const html = await render()
  expect(html).not.toContain('id="s-trainings"')
  expect(html).toContain('Sommercamp')
})

it('zeigt Camps weiter, wenn das Laden der Trainings fehlschlägt', async () => {
  vi.mocked(fetchTrainingOffers).mockRejectedValue(new Error('boom'))
  const html = await render()
  expect(html).toContain('Sommercamp')
  expect(html).not.toContain('id="s-trainings"')
})

it('zeigt Trainings auch ohne zukünftige Camps', async () => {
  vi.mocked(fetchCamps).mockResolvedValue([])
  vi.mocked(fetchTrainingOffers).mockResolvedValue([offer])
  const html = await render()
  expect(html).toContain('Aktuell keine Camps')
  expect(html).toContain('href="/pilot/testverein/training/torwart"')
})

it('zeigt die Angebotsart als Badge, nur wenn gesetzt', async () => {
  vi.mocked(fetchTrainingOffers).mockResolvedValue([{ ...offer, category: 'athletik' }, groupOffer])
  const html = await render()
  expect(html).toContain('Athletiktraining')
  expect(html.match(/data-testid="offer-category"/g)).toHaveLength(1)
})

it('blendet den Trainingsbereich aus, wenn das Trainings-Modul nicht freigeschaltet ist', async () => {
  vi.mocked(fetchOrganization).mockResolvedValue({ ...org, modules: ['camps'] })
  vi.mocked(fetchTrainingOffers).mockResolvedValue([offer])
  const html = await render()
  expect(html).not.toContain('id="s-trainings"')
  expect(html).not.toContain('/training/torwart')
  expect(html).toContain('Sommercamp')
})
