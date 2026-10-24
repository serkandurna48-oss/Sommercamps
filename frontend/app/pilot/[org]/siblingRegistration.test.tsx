// @vitest-environment jsdom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import ParentFlow from './ParentFlow'
import RegistrationFormScreen from './RegistrationFormScreen'
import { parentDetailsOnly } from './siblingRegistration'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.test', contact_phone: null,
  logo_url: null, primary_color: null, theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
  registration_questions: [{ key: 'team', label: 'Mannschaft', type: 'text', required: false, options: null, other_label: null }],
}
const camp: CampPublic = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 10, spots_remaining: 10, waitlist_count: 0, is_full: false,
}
const result: RegistrationCreated = {
  registration_token: 'synthetic-token', status: 'registered', payment_status: 'open', payment_reference: 'CP-TEST',
}
const parents = {
  parentName: 'Eva Muster', parentEmail: 'eva@example.test', parentPhone: '0561 12345',
  emergencyPhone: '0561 67890', pickupAuthorized: 'Eva Muster, Alex Muster',
}
const parentFields = {
  parent_name: parents.parentName, parent_email: parents.parentEmail, parent_phone: parents.parentPhone,
  emergency_phone: parents.emergencyPhone, pickup_authorized: parents.pickupAuthorized,
}
let host: HTMLDivElement
let root: Root
let initialUrl: string
let storageWrite: ReturnType<typeof vi.spyOn>
let cookieWrite: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('scrollTo', vi.fn())
  HTMLElement.prototype.scrollIntoView = vi.fn()
  sessionStorage.clear()
  localStorage.clear()
  initialUrl = location.href
  storageWrite = vi.spyOn(Storage.prototype, 'setItem')
  cookieWrite = vi.spyOn(Document.prototype, 'cookie', 'set')
  vi.mocked(submitRegistration).mockResolvedValue({ ok: true, data: result })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function field(name: string) {
  const element = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`)
  expect(element, `Feld ${name} fehlt`).not.toBeNull()
  return element!
}

async function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(() => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(element => element.textContent?.trim() === text)
  expect(button, `Schaltfläche ${text} fehlt`).toBeDefined()
  await act(() => button!.click())
}

async function submit() {
  await act(() => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

async function fillChild(firstName = 'Mia') {
  for (const [name, value] of Object.entries({ child_first_name: firstName, child_last_name: 'Muster', child_birth_date: '05.07.2017' })) {
    await change(field(name), value)
  }
}

async function acceptAll() {
  await act(() => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => { if (!input.checked) input.click() }))
}

async function firstRegistration(camps = [camp]) {
  await act(() => root.render(<StrictMode><ParentFlow org={org} camps={camps} /></StrictMode>))
  expect(host.textContent).not.toContain('Weiteres Kind anmelden')
  await act(() => host.querySelector<HTMLButtonElement>('button.camp')!.click())
  await click('Jetzt anmelden')
  expect(host.textContent).not.toContain('Ihre Angaben aus der letzten Anmeldung')
  await fillChild()
  for (const [name, value] of Object.entries(parentFields)) await change(field(name), value)
  await change(field('jersey_size'), '140')
  await change(field('allergies'), 'Synthetische Allergie')
  await change(host.querySelector<HTMLInputElement>('input[maxlength="80"]')!, 'U10')
  await acceptAll()
  await submit()
  expect(host.querySelector('#s-done')).not.toBeNull()
  expect(host.textContent).toContain('Weiteres Kind anmelden')
}

function expectFreshChildAndConsents() {
  for (const name of ['child_first_name', 'child_last_name', 'child_birth_date', 'jersey_size', 'allergies']) {
    expect(field(name).value, name).toBe('')
  }
  expect(host.querySelector<HTMLInputElement>('input[maxlength="80"]')!.value).toBe('')
  const checkboxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
  expect(checkboxes).toHaveLength(3)
  checkboxes.forEach(checkbox => expect(checkbox.checked, checkbox.closest('label')?.textContent).toBe(false))
}

function expectNoPersistence() {
  // Memory-only alternative: no transfer key is ever created, including before/after prefill and submit.
  expect(sessionStorage.length).toBe(0)
  expect(localStorage.length).toBe(0)
  expect(storageWrite).not.toHaveBeenCalled()
  expect(cookieWrite).not.toHaveBeenCalled()
  expect(location.href).toBe(initialUrl)
}

it('übernimmt nur Elternangaben für das zweite und dritte Kind; alle Einwilligungen bleiben leer', async () => {
  await firstRegistration()
  expectNoPersistence()
  await click('Weiteres Kind anmelden')
  expect(host.querySelector('#s-form')).not.toBeNull()
  expect(host.querySelector('[name="sibling_camp"]')).toBeNull()
  expect(host.querySelector('h1')!.textContent).toContain(camp.title)
  expect(document.activeElement).toBe(host.querySelector('h1'))
  for (const [name, value] of Object.entries(parentFields)) expect(field(name).value).toBe(value)
  expect(host.textContent).toContain('Ihre Angaben aus der letzten Anmeldung – bitte prüfen.')
  expectFreshChildAndConsents()
  expectNoPersistence()

  await fillChild('Jonas')
  await submit()
  expect(submitRegistration).toHaveBeenCalledTimes(1)
  expect(host.querySelector('#err-agb')).not.toBeNull()
  expect(host.querySelector('#err-privacy')).not.toBeNull()
  expect(document.activeElement?.id).toBe('terms_accepted')
  expectNoPersistence()
  await change(field('parent_phone'), '0561 99999')
  await acceptAll()
  await submit()
  expect(submitRegistration).toHaveBeenLastCalledWith(org.slug, camp.slug, expect.objectContaining({
    child_first_name: 'Jonas', parent_phone: '0561 99999', allergies: null, jersey_size: null,
    terms_accepted: true, privacy_accepted: true, photo_permission: true, extra_answers: undefined,
  }))
  await click('Weiteres Kind anmelden')
  expect(field('parent_phone').value).toBe('0561 99999')
  expectFreshChildAndConsents()
  expectNoPersistence()
})

it('wählt dasselbe Camp vor und meldet nach Camp-Wechsel beim gewählten Termin an', async () => {
  const second = { ...camp, slug: 'herbst', title: 'Herbstcamp', price_cents: 19900, is_full: true }
  const closed = { ...camp, slug: 'geschlossen', title: 'Geschlossen', registration_open: false }
  await firstRegistration([camp, second, closed])
  await click('Weiteres Kind anmelden')
  expect(field('sibling_camp').value).toBe(camp.slug)
  expect(host.querySelector('label[for="sibling_camp"]')?.textContent).toContain('Camp für das weitere Kind')
  expect(field('sibling_camp').id).toBe('sibling_camp')
  expect(host.querySelector<HTMLOptionElement>('option[value="geschlossen"]')!.disabled).toBe(true)
  await fillChild('Jonas')
  await acceptAll()
  await change(field('sibling_camp'), second.slug)
  expectFreshChildAndConsents()
  expect(field('parent_name').value).toBe(parents.parentName)
  expect(host.querySelector('h1')!.textContent).toContain(second.title)
  expect(host.querySelector('button[type="submit"]')!.textContent).toBe('Auf die Warteliste setzen')
  await fillChild('Jonas')
  await acceptAll()
  await submit()
  expect(submitRegistration).toHaveBeenLastCalledWith(org.slug, second.slug, expect.objectContaining({ child_first_name: 'Jonas' }))
  expectNoPersistence()
})

it('verwirft die Übernahme beim Zurückgehen und nach einem erneuten Mount', async () => {
  await firstRegistration()
  await click('Weiteres Kind anmelden')
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zurück zum Camp"]')!.click())
  await click('Jetzt anmelden')
  for (const name of Object.keys(parentFields)) expect(field(name).value).toBe('')
  expectFreshChildAndConsents()
  await act(() => root.unmount())
  root = createRoot(host)
  await act(() => root.render(<ParentFlow org={org} camps={[camp]} />))
  await act(() => host.querySelector<HTMLButtonElement>('button.camp')!.click())
  await click('Jetzt anmelden')
  for (const name of Object.keys(parentFields)) expect(field(name).value).toBe('')
  expectNoPersistence()
})

it('übernimmt auch nach Wartelisten-Erfolg nur Elternangaben', async () => {
  vi.mocked(submitRegistration).mockResolvedValue({ ok: true, data: { ...result, status: 'waitlist' } })
  await firstRegistration()
  expect(host.textContent).not.toContain('In den Kalender eintragen')
  expect(host.textContent).not.toContain('Per WhatsApp teilen')
  await click('Weiteres Kind anmelden')
  expect(field('parent_email').value).toBe(parents.parentEmail)
  expectFreshChildAndConsents()
})

it('begrenzt Übergabedaten zur Laufzeit und verbraucht die Übergabe beim Vorbefüllen und jedem Submit', async () => {
  const contaminated = { ...parents, termsAccepted: true, privacyAccepted: true, photoPermission: true, childFirstName: 'Alt', extraAnswers: { team: 'Alt' } }
  expect(parentDetailsOnly(contaminated)).toEqual(parents)
  const consumed = vi.fn()
  await act(() => root.render(<RegistrationFormScreen orgSlug={org.slug} orgName={org.name} camp={camp}
    hasBankDetails={false} questions={org.registration_questions} parentPrefill={contaminated}
    onPrefillConsumed={consumed} onBack={() => {}} onSubmitted={() => {}} />))
  expect(consumed).toHaveBeenCalledTimes(1)
  expectFreshChildAndConsents()
  await submit()
  expect(consumed).toHaveBeenCalledTimes(2)
  expect(submitRegistration).not.toHaveBeenCalled()
  expectNoPersistence()
})

it('behält Kalender und WhatsApp nach erster und zweiter Anmeldung bei', async () => {
  await firstRegistration()
  function expectSuccessActions() {
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.trim() === 'In den Kalender eintragen')).toBe(true)
    const whatsapp = host.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!
    expect(whatsapp.textContent).toContain('Per WhatsApp teilen')
    expect(new URL(whatsapp.href).searchParams.get('text')).toBe(`Ich habe mein Kind für ${camp.title} angemeldet: ${location.origin}/pilot/${org.slug}`)
    expect(document.activeElement).toBe(host.querySelector('h1'))
  }
  expectSuccessActions()
  await click('Weiteres Kind anmelden')
  await submit()
  expect(document.activeElement?.id).toBe('child_first_name')
  await fillChild('Jonas')
  await acceptAll()
  await submit()
  expectSuccessActions()
  expectNoPersistence()
})

it('erhält bei einem Geschwister-Submitfehler Eingaben, Meldung und Fokus; Campwechsel verwirft den Fehler', async () => {
  const second = { ...camp, slug: 'herbst', title: 'Herbstcamp' }
  await firstRegistration([camp, second])
  await click('Weiteres Kind anmelden')
  await fillChild('Jonas')
  await acceptAll()
  vi.mocked(submitRegistration).mockResolvedValueOnce({ ok: false, status: 409, detail: 'Conflict' })
  await submit()
  const error = host.querySelector('[role="alert"].public-submit-error')!
  expect(error.textContent).toContain('bereits eine Anmeldung vor')
  expect(document.activeElement).toBe(error)
  expect(host.querySelector(`a[href="mailto:${org.contact_email}"]`)?.textContent).toBe('Kontakt aufnehmen')
  expect(field('child_first_name').value).toBe('Jonas')
  for (const [name, value] of Object.entries(parentFields)) expect(field(name).value).toBe(value)
  await change(field('sibling_camp'), second.slug)
  expect(host.querySelector('.public-submit-error')).toBeNull()
  expectFreshChildAndConsents()
  expect(host.querySelector('button[type="submit"]')?.textContent).toContain('Verbindlich anmelden')
  await fillChild('Jonas')
  await acceptAll()
  await submit()
  expect(submitRegistration).toHaveBeenLastCalledWith(org.slug, second.slug, expect.objectContaining({ child_first_name: 'Jonas' }))
  expect(host.querySelector('#s-done')).not.toBeNull()
  expectNoPersistence()
})
