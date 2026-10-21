// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { submitRegistration, type CampPublic, type SubmitRegistrationResult } from '../../lib/saasApi'
import RegistrationFormScreen from './RegistrationFormScreen'
import CampSummary from './CampSummary'

vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))
const camp: CampPublic = {
  slug: 'herbst', title: 'Herbstcamp', start_date: '2027-10-25', end_date: '2027-10-29',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: 'Sportplatz', care_info: null, meals_info: null, includes: null,
  registered_count: 18, spots_remaining: 2, waitlist_count: 0, is_full: false,
}
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
  await act(async () => root.render(<RegistrationFormScreen orgSlug="demo" orgName="Demo" hasBankDetails={false}
    camp={camp} onBack={() => {}} onSubmitted={onSubmitted} />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function fill() {
  const values = ['Mia', 'Muster', '01012018', 'Eva Muster', 'eva@example.com', '0561 1234', '0561 5678', '']
  await act(async () => {
    host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])').forEach((input, index) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, values[index])
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    host.querySelectorAll<HTMLInputElement>('input[required][type=checkbox]').forEach(input => input.click())
  })
}

async function submit() {
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

it('marks required inputs, supplies keyboard/autofill metadata and exposes both legal links', () => {
  const required = host.querySelectorAll<HTMLInputElement>('input[required]')
  expect(required).toHaveLength(9)
  required.forEach(input => expect(input.closest('label')!.textContent).toContain('*'))
  expect(host.querySelector('input[type=email]')?.getAttribute('inputmode')).toBe('email')
  expect(host.querySelector('input[autocomplete="section-emergency tel"]')?.getAttribute('type')).toBe('tel')
  expect(host.querySelector('input[autocomplete="section-child bday"]')?.getAttribute('inputmode')).toBe('numeric')
  for (const route of ['datenschutz', 'teilnahmebedingungen']) {
    const link = host.querySelector<HTMLAnchorElement>(`a[href="/pilot/demo/${route}"]`)!
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(link.compareDocumentPosition(host.querySelector('button[type=submit]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
})

it('focuses the first error and connects every invalid input to its field message', async () => {
  await submit()
  expect(document.activeElement).toBe(host.querySelector('input'))
  const invalid = host.querySelectorAll('input[aria-invalid=true]')
  expect(invalid).toHaveLength(9)
  invalid.forEach(input => {
    const id = input.getAttribute('aria-describedby')!.split(' ')[0]
    expect(document.getElementById(id)?.textContent).toBeTruthy()
  })
  expect(submitRegistration).not.toHaveBeenCalled()
})

it('retains values and focuses backend field errors', async () => {
  vi.mocked(submitRegistration).mockResolvedValue({ ok: false, status: 422, detail: 'Bitte prüfen Sie die Angaben.',
    fieldErrors: { parent_email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' } })
  await fill()
  await submit()
  const email = host.querySelector<HTMLInputElement>('input[type=email]')!
  expect(document.activeElement).toBe(email)
  expect(email.value).toBe('eva@example.com')
  expect(email.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById('err-parent-email')?.textContent).toContain('gültige')
  expect(host.querySelector<HTMLInputElement>('input[autocomplete="section-child bday"]')?.value).toBe('01.01.2018')
  expect(onSubmitted).not.toHaveBeenCalled()
})

it('blocks two submissions in the same event turn and keeps pending controls disabled', async () => {
  let resolve!: (value: SubmitRegistrationResult) => void
  vi.mocked(submitRegistration).mockImplementation(() => new Promise(done => { resolve = done }))
  await fill()
  await act(async () => {
    const form = host.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(submitRegistration).toHaveBeenCalledTimes(1)
  expect(host.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('.back')?.disabled).toBe(true)
  await act(async () => resolve({ ok: true, data: { registration_token: 'test', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234' } }))
  expect(onSubmitted).toHaveBeenCalledTimes(1)
})

it('keeps values after a network failure and permits a retry', async () => {
  vi.mocked(submitRegistration).mockRejectedValueOnce(new Error('offline'))
  await fill()
  await submit()
  expect(host.textContent).toContain('Verbindung zum Server fehlgeschlagen')
  expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('Mia')
  expect(host.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false)
  vi.mocked(submitRegistration).mockResolvedValue({ ok: false, status: 409, detail: 'Bereits angemeldet.' })
  await submit()
  expect(submitRegistration).toHaveBeenCalledTimes(2)
})

it('shows price, date, location, age and availability above the form', () => {
  const summary = host.querySelector('.camp-summary')!
  for (const text of ['149,00 €', '25.–29. Okt. 2027', 'Sportplatz', '6 bis 12 Jahre', '2 Plätze frei']) {
    expect(summary.textContent).toContain(text)
  }
  expect(summary.compareDocumentPosition(host.querySelector('form')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('clearly identifies the waitlist and handles a missing venue', async () => {
  await act(async () => root.render(<CampSummary camp={{ ...camp, is_full: true, location: null }} />))
  expect(host.textContent).toContain('Warteliste — das Camp ist ausgebucht')
  expect(host.textContent).toContain('Es entstehen noch keine Kosten')
  expect(host.textContent).toContain('Den Treffpunkt teilt Ihnen der Verein mit')
})
