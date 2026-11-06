// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import RegistrationFormScreen from './RegistrationFormScreen'

vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))

const camp: CampPublic = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 0, spots_remaining: 20, waitlist_count: 0, is_full: false,
}
const base = {
  child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '04.01.2017',
  parent_name: 'Eva Muster', parent_email: 'eva@example.test', parent_phone: '0561 12345',
  emergency_phone: '0561 67890',
}
const ADDRESS_IDS = ['parent_street', 'parent_postal_code', 'parent_city']
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.mocked(submitRegistration).mockResolvedValue({
    ok: true, data: { registration_token: 't', status: 'registered', payment_status: 'open', payment_reference: 'CP' },
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function mount(node: ReactNode) {
  await act(async () => root.render(node))
}
function form(price = 14900, training?: { billingAddressRequired?: boolean }) {
  return <RegistrationFormScreen orgSlug="testverein" orgName="Testverein" camp={{ ...camp, price_cents: price }}
    hasBankDetails={false} onBack={() => {}} onSubmitted={() => {}}
    training={training && { dateTimeLabel: 'Mo., 05.07.2027, 17:00 Uhr', priceText: '30,00 €', ...training }} />
}
const input = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)
async function fill(values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(id)!, value)
      input(id)!.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await act(async () => {
    input('terms_accepted')!.click()
    input('privacy_accepted')!.click()
  })
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

it('zeigt die Rechnungsanschrift nur, wenn die Buchung Geld kostet', async () => {
  await mount(form(14900))
  expect(host.textContent).toContain('Rechnungsanschrift')
  expect(ADDRESS_IDS.map(id => input(id)?.getAttribute('autocomplete'))).toEqual(['street-address', 'postal-code', 'address-level2'])
  for (const id of ADDRESS_IDS) {
    expect(input(id)!.getAttribute('aria-required')).toBe('true')
    expect(host.querySelector(`label[for="${id}"]`)!.textContent).toContain('*')
  }
  await mount(form(0))
  expect(host.textContent).not.toContain('Rechnungsanschrift')
  for (const id of ADDRESS_IDS) expect(input(id)).toBeNull()
})

it('Training: Anschrift je nach möglichem Preis, unabhängig vom Mitgliedsstatus', async () => {
  await mount(form(0, { billingAddressRequired: true }))
  expect(input('parent_street')).not.toBeNull()
  await mount(form(0, { billingAddressRequired: false }))
  expect(input('parent_street')).toBeNull()
})

it('verlangt Straße, PLZ und Ort mit Sie-Meldungen und sendet nichts', async () => {
  await mount(form())
  await fill(base)
  await submit()
  expect(submitRegistration).not.toHaveBeenCalled()
  expect(document.activeElement?.id).toBe('parent_street')
  expect(document.getElementById('err-billing-street')?.textContent).toBe('Bitte tragen Sie Straße und Hausnummer ein.')
  expect(document.getElementById('err-billing-postal-code')?.textContent).toBe('Bitte tragen Sie die Postleitzahl ein.')
  expect(document.getElementById('err-billing-city')?.textContent).toBe('Bitte tragen Sie den Ort ein.')
  for (const id of ADDRESS_IDS) {
    expect(input(id)!.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input(id)!.getAttribute('aria-describedby')!)).not.toBeNull()
  }
})

it('prüft PLZ-Format und Länge', async () => {
  await mount(form())
  await fill({ ...base, parent_street: 'S'.repeat(121), parent_postal_code: '12', parent_city: 'O'.repeat(81) })
  await submit()
  expect(submitRegistration).not.toHaveBeenCalled()
  expect(document.getElementById('err-billing-street')?.textContent).toBe('Bitte höchstens 120 Zeichen.')
  expect(document.getElementById('err-billing-postal-code')?.textContent).toBe('Bitte prüfen Sie die Postleitzahl (4 bis 10 Zeichen).')
  expect(document.getElementById('err-billing-city')?.textContent).toBe('Bitte höchstens 80 Zeichen.')
})

it('sendet die getrimmte Anschrift bei kostenpflichtigen Buchungen', async () => {
  await mount(form())
  await fill({ ...base, parent_street: ' Hauptstraße 5 ', parent_postal_code: ' 34117 ', parent_city: ' Kassel ' })
  await submit()
  expect(submitRegistration).toHaveBeenCalledWith('testverein', 'sommer', expect.objectContaining({
    parent_street: 'Hauptstraße 5', parent_postal_code: '34117', parent_city: 'Kassel',
  }))
})

it('sendet bei kostenlosen Buchungen keine Anschrift', async () => {
  await mount(form(0))
  await fill(base)
  await submit()
  const payload = vi.mocked(submitRegistration).mock.calls[0][2]
  expect(payload).not.toHaveProperty('parent_street')
  expect(payload).not.toHaveProperty('parent_city')
})

it('zeigt die Anschrift, wenn der Server sie nachträglich verlangt', async () => {
  vi.mocked(submitRegistration).mockResolvedValue({
    ok: false, status: 422, detail: 'Bitte prüfen Sie die markierten Angaben.',
    fieldErrors: { parent_street: 'Bitte geben Sie Ihre Rechnungsanschrift an.' },
  })
  await mount(form(0))
  await fill(base)
  await submit()
  expect(input('parent_street')).not.toBeNull()
  // Section appears with the field-specific client messages; the empty fields are marked.
  expect(document.getElementById('err-billing-street')?.textContent).toBe('Bitte tragen Sie Straße und Hausnummer ein.')
  expect(input('parent_street')!.getAttribute('aria-invalid')).toBe('true')
})

it('submitRegistration ordnet die 422-Meldung den fehlenden Anschriftfeldern zu', async () => {
  const api = await vi.importActual<typeof import('../../lib/saasApi')>('../../lib/saasApi')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: api.BILLING_ADDRESS_REQUIRED_DETAIL }), { status: 422 })))
  const result = await api.submitRegistration('testverein', 'sommer', {
    parent_first_name: 'Eva', parent_last_name: 'Muster', parent_email: 'eva@example.test', parent_phone: '1',
    child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '2017-01-04',
    photo_permission: false, terms_accepted: true, privacy_accepted: true, parent_street: 'Hauptstraße 5',
  })
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.fieldErrors).toEqual({
    parent_postal_code: 'Bitte geben Sie Ihre Rechnungsanschrift an.',
    parent_city: 'Bitte geben Sie Ihre Rechnungsanschrift an.',
  })
  expect(result.detail).toBe('Bitte prüfen Sie die markierten Angaben.')
})
