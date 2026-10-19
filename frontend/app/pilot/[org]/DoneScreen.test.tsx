import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import DoneScreen from './DoneScreen'

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org = {
  slug: 'testverein', name: 'Testverein', legal_name: 'Testverein e. V.', legal_address: null,
  contact_person_name: null, contact_email: 'kontakt@testverein.example', contact_phone: '0561 1234',
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null,
  logo_url: null, primary_color: null, theme: 'tradition', iban: 'DE89370400440532013000',
} satisfies OrganizationPublic

const camp = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12, capacity: 20,
  price_cents: 14900, currency: 'EUR', registration_open: true, location: null, care_info: null,
  meals_info: null, includes: null, registered_count: 20, waitlist_count: 1, spots_remaining: 0,
  is_full: true,
} satisfies CampPublic

const result = {
  registration_token: 'tok', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234',
} satisfies RegistrationCreated

function render(overrides: { org?: Partial<OrganizationPublic>; result?: Partial<RegistrationCreated> } = {}) {
  return renderToStaticMarkup(
    <DoneScreen
      org={{ ...org, ...overrides.org }}
      camp={camp}
      result={{ ...result, ...overrides.result }}
      childName="Mia"
      parentEmail="eva@example.de"
      onBackToOrg={() => {}}
    />,
  )
}

it('shows the transfer details for a regular registration', () => {
  const html = render()
  expect(html).toContain('Mia ist angemeldet')
  expect(html).toContain('DE89370400440532013000')
  expect(html).toContain('CP-1234')
})

it('does not promise an automatic payment match, because the club books it by hand', () => {
  const html = render()
  expect(html).not.toContain('automatisch')
  expect(html).toContain('von Hand')
})

it('does not promise a confirmation mail when no bank details are stored', () => {
  const html = render({ org: { iban: null } })
  expect(html).not.toContain('Folgt in der Bestätigungs-E-Mail')
  expect(html).not.toContain('>IBAN<')
  expect(html).toContain('kontakt@testverein.example')
})

it('announces no send-out the pilot cannot perform', () => {
  const html = render()
  expect(html).toContain('geht noch keine Bestätigungs-E-Mail raus')
  expect(html).not.toContain('Infopaket')
})

it('separates the waitlist case from a reserved place', () => {
  const html = render({ result: { status: 'waitlist' } })
  expect(html).toContain('Mia ist auf der Warteliste')
  expect(html).toContain('Es entstehen noch keine Kosten')
  expect(html).not.toContain('Jetzt überweisen')
  expect(html).not.toContain('DE89370400440532013000')
  expect(html).not.toContain('Zahlung offen')
})

it('does not promise a 48-hour acceptance window on the waitlist', () => {
  const html = render({ result: { status: 'waitlist' } })
  expect(html).not.toContain('48 Stunden')
  expect(html).toContain('meldet sich')
})

it('does not promise a prior acceptance step before costs on the waitlist', () => {
  const html = render({ result: { status: 'waitlist' } })
  expect(html).not.toContain('Zusage')
  expect(html).toContain('sofort nach')
})

// ── M3: Zusammenfassung und Überweisungsblock ──
it('rendert Zusammenfassungskarte mit Kind, Camp, Zeitraum und Preis', () => {
  const html = render()
  expect(html).toContain('done-summary')
  expect(html).toContain('Mia') // Kind
  expect(html).toContain('Sommercamp') // Camp-Titel
  expect(html).toContain('149') // Preis 149,00 € enthält "149"
})

it('rendert Überweisungsblock mit kopierbarem Verwendungszweck bei gesetzter IBAN', () => {
  const html = render()
  expect(html).toContain('done-transfer')
  expect(html).toContain('DE89370400440532013000') // IBAN
  expect(html).toContain('done-ref') // monospace Verwendungszweck-Element
  expect(html).toContain('CP-1234') // Verwendungszweck
})

it('zeigt keinen Überweisungsblock bei Warteliste', () => {
  const html = render({ result: { status: 'waitlist' } })
  expect(html).not.toContain('done-transfer')
  expect(html).not.toContain('DE89370400440532013000')
})
