// @vitest-environment jsdom
/**
 * UC4b Frontend-Ablauftest: Elternformular → DoneScreen → Admin-Zahlung.
 *
 * Gemockte API (kein echter Server). Abdeckung:
 *   - Elternformular befüllen + absenden → onSubmitted erhält RegistrationCreated
 *     mit CP-Referenz
 *   - DoneScreen mit IBAN: Überweisungsblock mit IBAN + Verwendungszweck sichtbar
 *   - DoneScreen ohne IBAN: "Der Verein meldet sich zur Zahlung" statt IBAN-Block
 *   - Admin-Zahlung: PaymentSection zeigt offene Anmeldung, "Als bezahlt markieren"
 *     ändert den Status und zeigt Quittung
 *
 * Was NICHT abgedeckt wird: echte API-Aufrufe, Browser-Navigation, Stripe.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CampPublic,
  OrganizationPublic,
  RegistrationCreated,
} from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import RegistrationFormScreen from './RegistrationFormScreen'
import DoneScreen from './DoneScreen'
import PaymentSection, { type PaymentEntry } from '../../components/saas/data/PaymentSection'
import { setPaymentStatusAction } from '../../components/saas/actions/paymentActions'

vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('../../components/saas/actions/paymentActions', () => ({
  setPaymentStatusAction: vi.fn(),
}))

// ── Fixtures ────────────────────────────────────────────────────────────────

const camp: CampPublic = {
  slug: 'sommer',
  title: 'Sommerreise 2027',
  start_date: '2027-07-05',
  end_date: '2027-07-09',
  registration_start: null,
  registration_end: null,
  age_min: 6,
  age_max: 12,
  capacity: 20,
  price_cents: 14900,
  currency: 'EUR',
  registration_open: true,
  location: 'Sportanlage Nord',
  care_info: null,
  meals_info: null,
  includes: null,
  registered_count: 10,
  spots_remaining: 10,
  waitlist_count: 0,
  is_full: false,
}

const orgWithIban: OrganizationPublic = {
  slug: 'reise-verein',
  name: 'Reise-Verein',
  legal_name: null,
  legal_address: null,
  contact_person_name: null,
  contact_email: 'reise@example.com',
  contact_phone: '0561 112233',
  logo_url: null,
  primary_color: null,
  theme: 'tradition',
  intro_heading: null,
  intro_text: null,
  hero_image_url: null,
  trainer_image_url: null,
  trainer_text: null,
  terms_text: null,
  iban: 'DE89370400440532013000',
}

const orgWithoutIban: OrganizationPublic = { ...orgWithIban, iban: null }

const registrationResult: RegistrationCreated = {
  registration_token: '1a2b3c4d-5678-90ab-cdef-123456789abc',
  status: 'registered',
  payment_status: 'open',
  payment_reference: 'CP-1A2B3C4D',
}

// ── Part 1: Elternformular + DoneScreen ─────────────────────────────────────

describe('Elternformular → DoneScreen', () => {
  let host: HTMLDivElement
  let root: Root
  const onSubmitted = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    HTMLElement.prototype.scrollIntoView = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root.render(
        <RegistrationFormScreen
          orgSlug="reise-verein"
          orgName="Reise-Verein"
          hasBankDetails={true}
          camp={camp}
          onBack={() => {}}
          onSubmitted={onSubmitted}
        />,
      ),
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  async function fill() {
    const values = [
      'Mia', 'Muster', '05072017', 'Eva Muster',
      'eva@example.com', '0561 1234', '0561 5678', '',
    ]
    await act(async () => {
      host
        .querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')
        .forEach((input, index) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            input,
            values[index],
          )
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      host
        .querySelectorAll<HTMLInputElement>('input[required][type=checkbox]')
        .forEach(input => input.click())
    })
  }

  async function submit() {
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  }

  it('Formular abschicken → onSubmitted erhält CP-Referenz und Kind-/Elterndaten', async () => {
    vi.mocked(submitRegistration).mockResolvedValueOnce({
      ok: true,
      data: registrationResult,
    })
    await fill()
    await submit()
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    const [result, childFirstName, parentEmail] = vi.mocked(onSubmitted).mock.calls[0] as [
      RegistrationCreated,
      string,
      string,
    ]
    expect(result.payment_reference).toBe('CP-1A2B3C4D')
    expect(result.status).toBe('registered')
    expect(childFirstName).toBe('Mia')
    expect(parentEmail).toBe('eva@example.com')
  })

  it('DoneScreen mit IBAN: zeigt Verwendungszweck und IBAN-Überweisungsblock', async () => {
    vi.mocked(submitRegistration).mockResolvedValueOnce({
      ok: true,
      data: registrationResult,
    })
    await fill()
    await submit()
    const [result, childFirstName, parentEmail] = vi.mocked(onSubmitted).mock.calls[0] as [
      RegistrationCreated,
      string,
      string,
    ]
    const html = renderToStaticMarkup(
      <DoneScreen
        org={orgWithIban}
        camp={camp}
        result={result}
        childName={childFirstName}
        parentEmail={parentEmail}
        onBackToOrg={() => {}}
      />,
    )
    expect(html).toContain('Mia ist angemeldet')
    expect(html).toContain('CP-1A2B3C4D')
    expect(html).toContain('DE89370400440532013000')
    expect(html).toContain('done-transfer')
  })

  it('DoneScreen ohne IBAN: Verein meldet sich zur Zahlung, kein IBAN-Block', async () => {
    vi.mocked(submitRegistration).mockResolvedValueOnce({
      ok: true,
      data: registrationResult,
    })
    await fill()
    await submit()
    const [result, childFirstName, parentEmail] = vi.mocked(onSubmitted).mock.calls[0] as [
      RegistrationCreated,
      string,
      string,
    ]
    const html = renderToStaticMarkup(
      <DoneScreen
        org={orgWithoutIban}
        camp={camp}
        result={result}
        childName={childFirstName}
        parentEmail={parentEmail}
        onBackToOrg={() => {}}
      />,
    )
    expect(html).toContain('CP-1A2B3C4D')
    expect(html).not.toContain('DE89370400440532013000')
    expect(html).not.toContain('class="done-transfer"')
    expect(html).toContain('Der Verein meldet sich zur Zahlung')
  })
})

// ── Part 2: Admin-Camp-Seite → Als bezahlt markieren ────────────────────────

describe('Admin-Camp-Seite: Zahlung markieren', () => {
  let container: HTMLDivElement
  let root: Root

  const entry: PaymentEntry = {
    registration: {
      id: 'reg-1',
      registration_token: '1a2b3c4d-5678-90ab-cdef-123456789abc',
      payment_reference: 'CP-1A2B3C4D',
      status: 'registered',
      payment_status: 'open',
      child_first_name: 'Mia',
      child_last_name: 'Muster',
      child_birth_date: '2017-07-05',
      parent_first_name: 'Eva',
      parent_last_name: 'Muster',
      parent_email: 'eva@example.com',
      parent_phone: '0561 1234',
      emergency_contact_name: null,
      emergency_contact_phone: null,
      medical_notes: null,
      allergies: null,
      jersey_size: null,
      pickup_authorized: null,
      photo_permission: false,
      created_at: '2027-01-01T00:00:00Z',
    },
    camp: {
      id: 'camp-1',
      organization_id: 'org-1',
      slug: 'sommer',
      title: 'Sommerreise 2027',
      start_date: '2027-07-05',
      end_date: '2027-07-09',
      registration_start: null,
      registration_end: null,
      age_min: 6,
      age_max: 12,
      capacity: 20,
      price_cents: 14900,
      currency: 'EUR',
      status: 'published',
      location: null,
      care_info: null,
      meals_info: null,
      includes: null,
    },
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(setPaymentStatusAction).mockImplementation(
      async (_org, _camp, _token, _status, success) => ({ error: null, success }),
    )
  })

  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
    vi.resetAllMocks()
  })

  it('zeigt offene Anmeldung und aktualisiert Status nach „Als bezahlt markieren"', async () => {
    await act(() =>
      root.render(
        <PaymentSection
          org={orgWithIban}
          entries={[entry]}
          orgSlug="reise-verein"
          brandColor="#112233"
          emptyLabel="Keine Anmeldungen"
          csvFilename="payments.csv"
          xlsxHref="/export"
        />,
      ),
    )

    // Anmeldung ist in der offenen Liste sichtbar
    expect(container.querySelector('.cp-ledger-row')).not.toBeNull()
    expect(container.textContent).toContain('CP-1A2B3C4D')
    expect(container.textContent).toContain('Mia Muster')

    // "Als bezahlt markieren" klicken
    const button = [...container.querySelectorAll('button')].find(
      b => b.textContent === 'Als bezahlt markieren',
    )
    expect(button, 'Schaltfläche "Als bezahlt markieren" fehlt').toBeDefined()
    await act(() => button!.click())

    expect(setPaymentStatusAction).toHaveBeenCalledOnce()
    expect(setPaymentStatusAction).toHaveBeenCalledWith(
      'reise-verein',
      'sommer',
      entry.registration.registration_token,
      'paid',
      expect.any(String),
      expect.any(Object),
    )

    // Quittung ist sichtbar
    expect(container.textContent).toContain('CP-1A2B3C4D')
    expect(container.textContent).toContain('Mia')
  })
})
