// @vitest-environment jsdom
import { StrictMode, act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { submitRegistration, type CampPublic } from '../../lib/saasApi'
import RegistrationFormScreen from './RegistrationFormScreen'

vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))

const camp: CampPublic = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 10, spots_remaining: 10, waitlist_count: 0, is_full: false,
}
const required = {
  child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '04.01.2017',
  parent_name: 'Eva Muster', parent_email: 'eva@example.test', parent_phone: '+49 561 12345',
  emergency_phone: '0561 67890',
}
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.mocked(submitRegistration).mockResolvedValue({ ok: true, data: {
    registration_token: 'synthetic', status: 'registered', payment_status: 'open', payment_reference: 'TEST',
  } })
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

async function mount(props: Partial<ComponentProps<typeof RegistrationFormScreen>> = {}) {
  await act(() => root.render(<StrictMode><RegistrationFormScreen orgSlug="testverein" orgName="Testverein"
    camp={camp} hasBankDetails={false} onBack={() => {}} onSubmitted={() => {}} {...props} /></StrictMode>))
}
function field(id: string) { return host.querySelector<HTMLInputElement>(`#${id}`)! }
async function fill(id: string, value: string, start = value.length, end = start, inputType = 'insertText') {
  const input = field(id)
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    if (input.type === 'text') input.setSelectionRange(start, end)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }))
  })
}
async function blur(id: string) {
  await act(() => field(id).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
}
async function submit() {
  await act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
async function fillRequired() {
  for (const [id, value] of Object.entries(required)) await fill(id, value)
  await act(() => {
    field('terms_accepted').click()
    field('privacy_accepted').click()
  })
}
function warns() {
  return !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
}

it('zeigt vor Touch weder Fehlermeldungen noch rote Felder, auch während der ersten Eingabe', async () => {
  await mount()
  expect(host.querySelectorAll('[aria-invalid="true"], .bad')).toHaveLength(0)
  expect(host.querySelectorAll('[id^="err-"]')).toHaveLength(0)
  await act(() => field('parent_email').focus())
  await fill('parent_email', 'eva@')
  expect(host.querySelectorAll('[aria-invalid="true"], .bad')).toHaveLength(0)
  expect(host.querySelectorAll('[id^="err-"]')).toHaveLength(0)
  await blur('parent_email')
  expect(field('parent_email').getAttribute('aria-invalid')).toBe('true')
  expect(field('parent_email').closest('label')!.classList.contains('bad')).toBe(true)
  expect(host.querySelector('#err-parent-email')!.textContent).toBe('Diese Adresse ist unvollständig. Beispiel: name@beispiel.de')
  expect(field('child_first_name').getAttribute('aria-invalid')).toBe('false')
  expect(document.activeElement).toBe(field('parent_email'))
  await fill('parent_email', 'eva@example.test')
  expect(host.querySelector('#err-parent-email')).toBeNull()
  expect(field('parent_email').closest('label')!.classList.contains('bad')).toBe(false)
})

it.each(Object.keys(required))('validiert das Pflichtfeld %s erst nach Blur und löscht den Fehler sofort bei Korrektur', async id => {
  await mount()
  expect(field(id).getAttribute('aria-invalid')).toBe('false')
  await blur(id)
  expect(field(id).getAttribute('aria-invalid')).toBe('true')
  const errorId = field(id).getAttribute('aria-describedby')!.split(' ')[0]
  const blurMessage = host.querySelector(`#${errorId}`)!.textContent
  await submit()
  expect(host.querySelector(`#${errorId}`)!.textContent).toBe(blurMessage)
  await fill(id, required[id as keyof typeof required])
  expect(field(id).getAttribute('aria-invalid')).toBe('false')
  expect(host.querySelector(`#${errorId}`)).toBeNull()
})

it.each(['parent_phone', 'emergency_phone'])('prüft das Format von %s bei Blur und Submit mit demselben Text', async id => {
  await mount()
  await fillRequired()
  for (const invalid of ['abc', '12-34', '12+34', '+']) {
    await fill(id, invalid)
    await blur(id)
    expect(field(id).getAttribute('aria-invalid')).toBe('true')
    const errorId = field(id).getAttribute('aria-describedby')!
    const message = document.getElementById(errorId)!.textContent
    await submit()
    expect(document.getElementById(errorId)!.textContent).toBe(message)
    expect(submitRegistration).not.toHaveBeenCalled()
  }
  await fill(id, '+49 561 12345')
  expect(field(id).getAttribute('aria-invalid')).toBe('false')
  await submit()
  expect(submitRegistration).toHaveBeenCalledOnce()
})

it.each(['terms_accepted', 'privacy_accepted'])('validiert %s nach Blur und entfernt den Fehler beim Ankreuzen', async id => {
  await mount()
  await blur(id)
  expect(field(id).getAttribute('aria-invalid')).toBe('true')
  await act(() => field(id).click())
  expect(field(id).getAttribute('aria-invalid')).toBe('false')
})

it('prüft Zusatzfragen erst nach Verlassen und lässt Fokuswechsel innerhalb einer Radiogruppe zu', async () => {
  await mount({ questions: [
    { key: 'team', label: 'Mannschaft', type: 'text', required: true, options: null, other_label: null },
    { key: 'position', label: 'Position', type: 'choice', required: true, options: ['Tor'], other_label: 'Andere' },
  ] })
  expect(host.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
  await blur('extra-team')
  expect(field('extra-team').getAttribute('aria-invalid')).toBe('true')
  await fill('extra-team', 'U10')
  expect(field('extra-team').getAttribute('aria-invalid')).toBe('false')
  await act(() => field('extra-position-0').dispatchEvent(new FocusEvent('focusout', {
    bubbles: true, relatedTarget: field('extra-position-other'),
  })))
  expect(host.querySelector('[role="radiogroup"]')!.getAttribute('aria-invalid')).toBe('false')
  await blur('extra-position-other')
  expect(host.querySelector('[role="radiogroup"]')!.getAttribute('aria-invalid')).toBe('true')
  await act(() => field('extra-position-0').click())
  expect(host.querySelector('[role="radiogroup"]')!.getAttribute('aria-invalid')).toBe('false')
})

it('formatiert Ziffern schrittweise, hält den Cursor und akzeptiert Punkte im mobilen Pattern', async () => {
  await mount()
  const input = field('child_birth_date')
  for (const [raw, formatted] of [
    ['0', '0'], ['04', '04.'], ['04.0', '04.0'], ['04.01', '04.01.'],
    ['04.01.2', '04.01.2'], ['04.01.20', '04.01.20'], ['04.01.201', '04.01.201'], ['04.01.2017', '04.01.2017'],
  ]) {
    await fill(input.id, raw)
    expect(input.value).toBe(formatted)
    expect(input.selectionStart).toBe(formatted.length)
  }
  expect(input.inputMode).toBe('numeric')
  expect(new RegExp(`^(?:${input.pattern})$`).test(input.value)).toBe(true)
  await fill(input.id, '05.01.2017', 2)
  expect(input.selectionStart).toBe(3)
  await fill(input.id, '05.01.2017x', 11)
  expect(input.value).toBe('05.01.2017')
  expect(input.selectionStart).toBe(10)
  await fill(input.id, '05.01.2017', 3, 5)
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
})

it('erlaubt Backspace und Delete an automatisch eingefügten Punkten', async () => {
  await mount()
  await fill('child_birth_date', '04')
  await fill('child_birth_date', '04', 2, 2, 'deleteContentBackward')
  expect(field('child_birth_date').value).toBe('0')
  expect(field('child_birth_date').selectionStart).toBe(1)
  await fill('child_birth_date', '04.01.2017')
  await fill('child_birth_date', '0401.2017', 2, 2, 'deleteContentForward')
  expect(field('child_birth_date').value).toBe('04.12.017')
  expect(field('child_birth_date').selectionStart).toBe(3)
  await fill('child_birth_date', '04.01.2017')
  await fill('child_birth_date', '4.01.2017', 0, 0, 'deleteContentForward')
  expect(field('child_birth_date').value).toBe('40.12.017')
  expect(field('child_birth_date').selectionStart).toBe(0)
  await fill('child_birth_date', '04.01.2017')
  await fill('child_birth_date', '04.1.2017', 3, 3, 'deleteContentForward')
  expect(field('child_birth_date').value).toBe('04.12.017')
  expect(field('child_birth_date').selectionStart).toBe(3)
})

it.each(['4.1.2017', ' 4.1.2017 ', '04012017'])('normalisiert eingefügtes Datum %s ohne Blockade', async pasted => {
  await mount()
  const input = field('child_birth_date')
  await fill(input.id, '01.01.2018')
  input.setSelectionRange(0, input.value.length)
  await act(() => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => pasted } })
    input.dispatchEvent(event)
  })
  expect(input.value).toBe('04.01.2017')
  expect(input.selectionStart).toBe(10)
  await blur(input.id)
  expect(input.getAttribute('aria-invalid')).toBe('false')
})

it('erkennt unmögliche Kalenderdaten und akzeptiert ein gültiges Schaltjahr', async () => {
  await mount()
  await fill('child_birth_date', '29.02.2017')
  await blur('child_birth_date')
  expect(field('child_birth_date').getAttribute('aria-invalid')).toBe('true')
  await fill('child_birth_date', '29.02.2016')
  expect(field('child_birth_date').getAttribute('aria-invalid')).toBe('false')
})

it.each([
  ['06.07.2021', true], ['05.07.2021', false], ['06.07.2014', false], ['05.07.2014', true],
])('berechnet den unverbindlichen Altershinweis für %s am Campbeginn', async (birth, hint) => {
  await mount()
  await fill('child_birth_date', birth)
  expect(host.querySelector('#hint-child-age')).toBeNull()
  await blur('child_birth_date')
  expect(Boolean(host.querySelector('#hint-child-age'))).toBe(hint)
  expect(field('child_birth_date').getAttribute('aria-invalid')).toBe('false')
  if (hint) {
    expect(host.querySelector('#hint-child-age')!.textContent).toContain('6 bis 12 Jahren')
    expect(field('child_birth_date').getAttribute('aria-describedby')).toBe('hint-child-age')
    await fillRequired()
    await fill('child_birth_date', birth)
    await submit()
    expect(submitRegistration).toHaveBeenCalledOnce()
    await fill('child_birth_date', '04.01.2017')
    expect(host.querySelector('#hint-child-age')).toBeNull()
  }
})

it.each(['child_first_name', 'parent_email', 'pickup_authorized'])('registriert beforeunload nur für ausgefüllte Angaben (%s), räumt bei Leerung und Unmount auf', async id => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  await mount()
  expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0)
  expect(warns()).toBe(false)
  await fill(id, '   ')
  expect(warns()).toBe(false)
  await fill(id, 'Test')
  const calls = add.mock.calls.filter(([type]) => type === 'beforeunload')
  expect(calls).toHaveLength(1)
  expect(warns()).toBe(true)
  await fill(id, '')
  expect(remove).toHaveBeenCalledWith('beforeunload', calls[0][1])
  expect(warns()).toBe(false)
  await fill(id, 'Test')
  await act(() => root.render(null))
  expect(warns()).toBe(false)
})

it('behält die Warnung bei fehlgeschlagenem Submit und entfernt sie nach erfolgreichem Submit', async () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const onSubmitted = vi.fn()
  await mount({ onSubmitted })
  await fillRequired()
  vi.mocked(submitRegistration).mockResolvedValueOnce({ ok: false, status: 503, detail: 'Test' })
  await submit()
  expect(warns()).toBe(true)
  expect(onSubmitted).not.toHaveBeenCalled()
  await submit()
  expect(onSubmitted).toHaveBeenCalledOnce()
  expect(field('parent_email').value).toBe(required.parent_email)
  expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1)
  expect(warns()).toBe(false)
})

it('schützt Geschwister-Vorbefüllung ohne sofortige Feldfehler', async () => {
  await mount({ parentPrefill: {
    parentName: 'Eva Muster', parentEmail: 'eva@example.test', parentPhone: '+49 561 12345',
    emergencyPhone: '0561 67890', pickupAuthorized: '',
  } })
  expect(warns()).toBe(true)
  expect(host.querySelectorAll('[aria-invalid="true"], .bad')).toHaveLength(0)
  expect(field('child_first_name').value).toBe('')
})

it('setzt beim Geschwister-Campwechsel Touch und Zusatzfragen zurück und behält die Elterndaten', async () => {
  const nextCamp = { ...camp, slug: 'herbst', title: 'Herbstcamp' }
  const props: Partial<ComponentProps<typeof RegistrationFormScreen>> = {
    siblingCamps: [camp, nextCamp],
    questions: [{ key: 'team', label: 'Mannschaft', type: 'text', required: true, options: null, other_label: null }],
    onCampChange: vi.fn(),
  }
  await mount(props)
  await fillRequired()
  await blur('child_first_name')
  await blur('child_birth_date')
  await blur('terms_accepted')
  await blur('extra-team')
  expect(field('extra-team').getAttribute('aria-invalid')).toBe('true')
  await act(() => {
    const select = host.querySelector<HTMLSelectElement>('#sibling_camp')!
    select.value = nextCamp.slug
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(props.onCampChange).toHaveBeenCalledWith(nextCamp.slug)
  await mount({ ...props, camp: nextCamp })
  expect(host.querySelectorAll('[aria-invalid="true"], .bad')).toHaveLength(0)
  expect(field('child_first_name').value).toBe('')
  expect(field('extra-team').value).toBe('')
  expect(field('parent_email').value).toBe(required.parent_email)
  expect(warns()).toBe(true)
})
