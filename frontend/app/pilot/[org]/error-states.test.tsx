// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchCamps, fetchOrganization, submitRegistration, type CampPublic, type OrganizationPublic } from '../../lib/saasApi'
import ParentFlow from './ParentFlow'
import OrgNotFound from './not-found'
import PilotOrgPage from './page'
import RegistrationFormScreen from './RegistrationFormScreen'

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({ publicFontClassName: (theme: string) => `font-${theme}` }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))
vi.mock('../../lib/saasApi', async (original) => ({
  ...await original<typeof import('../../lib/saasApi')>(),
  fetchOrganization: vi.fn(), fetchCamps: vi.fn(), submitRegistration: vi.fn(),
}))

const org: OrganizationPublic = {
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
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  window.scrollTo = vi.fn()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.mocked(fetchOrganization).mockResolvedValue(org)
  vi.mocked(fetchCamps).mockResolvedValue([camp])
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function renderFlow(camps = [camp], organization = org) {
  await act(async () => root.render(<ParentFlow org={organization} camps={camps} />))
}
async function openCamp() {
  await act(async () => host.querySelector<HTMLButtonElement>('.camp')!.click())
}
function action(text: string) {
  const actions = [...host.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a')]
  const result = actions.find(el => el.textContent?.trim() === text)
  expect(result, text).toBeTruthy()
  return result!
}

it.each(['unbekannt', 'unveröffentlicht'])('Verein %s: 404 zeigt deutschen Hinweis und Aktion, keine erfundene Marke', async () => {
  vi.mocked(fetchOrganization).mockResolvedValue(null)
  vi.mocked(fetchCamps).mockRejectedValue(new Error('404'))
  await expect(PilotOrgPage({ params: Promise.resolve({ org: 'fehlt' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  await act(async () => root.render(<OrgNotFound />))
  expect(host.textContent).toContain('Vereinsseite nicht verfügbar')
  expect(host.textContent).toContain('kein veröffentlichter Verein')
  expect(host.textContent).toContain('Bitte prüfen Sie den Vereinslink')
  action('Erneut versuchen')
  expect(host.querySelector('.cp-public')?.getAttribute('data-theme')).toBe('kompakt')
  expect(host.querySelector('img')).toBeNull()
  expect(host.textContent).not.toMatch(/not found|This page|Testverein/i)
})

it('Camp nach Auswahl entfernt: deutscher Hinweis, Vereinslogo und funktionierende Rückkehr', async () => {
  await renderFlow()
  await openCamp()
  await renderFlow([])
  expect(host.textContent).toContain('Camp nicht gefunden')
  expect(document.activeElement).toBe(host.querySelector('h1'))
  expect(host.querySelector('img')?.getAttribute('src')).toBe(org.logo_url)
  await act(async () => action('Alle Camps ansehen').click())
  expect(host.querySelector('#s-org')).not.toBeNull()
})

it('Camp voll: erklärt die Warteliste und öffnet deren Formular', async () => {
  await renderFlow([{ ...camp, is_full: true, spots_remaining: 0, registered_count: 20 }])
  await openCamp()
  expect(host.textContent).toContain('Alle 20 Plätze sind vergeben')
  expect(host.textContent).toContain('Sie können Ihr Kind über das Formular auf die Warteliste setzen.')
  expect(host.querySelector('img')?.getAttribute('alt')).toBe(org.name)
  await act(async () => action('Auf die Warteliste setzen').click())
  expect(host.querySelector('form')).not.toBeNull()
  expect(host.querySelector('button[type=submit]')?.textContent).toBe('Auf die Warteliste setzen')
})

it.each([
  ['noch nicht geöffnet', '2099-01-01T00:00:00Z', false],
  ['geschlossen', null, false],
  ['geschlossen', null, true],
] as const)('Anmeldung %s (Beginn: %s, voll: %s): erklärt die Sperre und bietet alle Camps', async (label, start, full) => {
  await renderFlow([{ ...camp, registration_open: false, registration_start: start,
    registration_end: start ? null : '2000-01-01T00:00:00Z', is_full: full }])
  await openCamp()
  expect(host.textContent).toContain(`Anmeldung ${label}`)
  expect(document.activeElement).toBe(host.querySelector('h1'))
  expect(host.textContent).toContain('Bitte sehen Sie sich die anderen Camps')
  expect(host.querySelector('img')?.getAttribute('alt')).toBe(org.name)
  expect(host.querySelector('form')).toBeNull()
  await act(async () => action('Alle Camps ansehen').click())
  expect(host.querySelector('#s-org')).not.toBeNull()
})

it.each([true, false])('Keine veröffentlichten Camps, Kontakt vorhanden: %s', async (contact) => {
  await renderFlow([], { ...org, contact_email: contact ? org.contact_email : '' })
  const state = host.querySelector('.no-future-camps')!
  expect(state.textContent).toContain('Aktuell sind keine Camps veröffentlicht.')
  expect(state.textContent).toContain('Bitte')
  const link = state.querySelector('a')
  if (contact) expect(link?.getAttribute('href')).toBe('mailto:camps@example.org')
  else expect(state.querySelector('button')?.textContent).toBe('Erneut versuchen')
})

it('Nur vergangene Camps: verspricht keine erfundenen neuen Termine', async () => {
  await act(async () => root.render(<ParentFlow org={org} camps={[]} hadPastCamps />))
  expect(host.textContent).toContain('keine weiteren Camp-Termine veröffentlicht')
  expect(host.textContent).not.toContain('in Kürze')
  expect(host.querySelector('.no-future-camps a')?.getAttribute('href')).toBe('mailto:camps@example.org')
})

it.each(['Verein', 'Camps'])('Ladefehler bei %s: deutsche Aktion und nur bekannte Vereinsdaten', async (resource) => {
  if (resource === 'Verein') vi.mocked(fetchOrganization).mockRejectedValue(new Error('offline'))
  else vi.mocked(fetchCamps).mockRejectedValue(new Error('503'))
  const html = renderToStaticMarkup(await PilotOrgPage({ params: Promise.resolve({ org: org.slug }) }))
  expect(html).toContain('Die Camp-Informationen konnten nicht geladen werden.')
  expect(html).toContain('Erneut versuchen')
  expect(html).toContain(resource === 'Verein' ? 'font-kompakt' : 'font-akademie')
  if (resource === 'Camps') {
    expect(html).toContain('test-logo.svg')
    expect(html).toContain('--brand-strong:')
  }
})

async function filledForm() {
  await act(async () => root.render(<RegistrationFormScreen orgSlug={org.slug} orgName={org.name}
    orgLogoUrl={org.logo_url} contactEmail={org.contact_email} hasBankDetails={false} camp={camp}
    questions={[{ key: 'hinweis', label: 'Zusatzangabe', type: 'text', required: false, options: null, other_label: null }]}
    onBack={vi.fn()} onSubmitted={vi.fn()} />))
  const values = ['Mia', 'Muster', '01012018', 'Eva Muster', 'eva@example.org', '0123456', '0654321', 'Eva Muster']
  await act(async () => {
    host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])').forEach((input, index) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, values[index] ?? 'Zusatzantwort')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const select = host.querySelector('select')!
    select.value = '140'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    host.querySelectorAll('textarea').forEach(textarea => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Testangabe')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    host.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input => input.click())
  })
}
function values() {
  return [...host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')]
    .map(el => ({ value: el.value, checked: el instanceof HTMLInputElement ? el.checked : null }))
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
it.each([
  [0, 'Die Verbindung zum Server ist fehlgeschlagen', 'Erneut versuchen'],
  [409, 'bereits eine Anmeldung vor', 'Kontakt aufnehmen'],
  [422, 'Bitte prüfen Sie Ihre Angaben', 'Erneut versuchen'],
  [429, 'zu viele Anmeldeversuche', 'Erneut versuchen'],
  [500, 'Der Server konnte die Anmeldung nicht bestätigen', 'Erneut versuchen'],
  [503, 'Der Server konnte die Anmeldung nicht bestätigen', 'Erneut versuchen'],
  [404, 'Dieses Camp ist nicht mehr verfügbar', 'Alle Camps ansehen'],
] as const)('Absenden %s: deutscher Hinweis, Aktion, Fokus und alle Eingaben erhalten', async (status, message, label) => {
  await filledForm()
  const before = values()
  if (status === 0) vi.mocked(submitRegistration).mockRejectedValue(new TypeError('Failed to fetch'))
  else vi.mocked(submitRegistration).mockResolvedValue({ ok: false, status, detail: 'Internal Server Error' })
  await submit()
  expect(submitRegistration).toHaveBeenCalledOnce()
  const error = host.querySelector('.public-submit-error')!
  expect(error.textContent).toContain(message)
  expect(error.textContent).not.toContain('Internal Server Error')
  expect(document.activeElement).toBe(error)
  expect(values()).toEqual(before)
  const button = action(label)
  expect(error.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  if (status === 409) expect(button.getAttribute('href')).toBe('mailto:camps@example.org')
  if (status === 404) expect(button.getAttribute('href')).toBe('/pilot/testverein')
  if (status === 0 || status >= 500) {
    const payload = vi.mocked(submitRegistration).mock.calls[0][2]
    await act(async () => button.click())
    expect(submitRegistration).toHaveBeenCalledTimes(2)
    expect(vi.mocked(submitRegistration).mock.calls[1][2]).toEqual(payload)
    expect(document.activeElement).toBe(host.querySelector('.public-submit-error'))
  }
})
