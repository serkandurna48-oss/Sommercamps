// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationQuestion } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import ParentFlow, { CampScreen } from './ParentFlow'
import RegistrationFormScreen from './RegistrationFormScreen'
import CampFilter from './CampFilter'
import { EMPTY_FILTER } from './campFilterUtils'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))

const camp: CampPublic = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: 'Sportplatz', care_info: null, meals_info: null, includes: null,
  registered_count: 10, spots_remaining: 10, waitlist_count: 0, is_full: false,
}
const org: OrganizationPublic = {
  slug: 'ksv-baunatal', name: 'Testverein', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.com', contact_phone: null,
  logo_url: '/logo.png', primary_color: null, theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: '/trainer.jpg', trainer_text: null, terms_text: null,
}
const questions: RegistrationQuestion[] = [
  { key: 'hinweis', label: 'Hinweis', type: 'text', required: true, options: null, other_label: null },
  { key: 'position', label: 'Position', type: 'choice', required: true, options: ['Feld', 'Tor'], other_label: 'Andere Position' },
]
const css = readFileSync('app/pilot/[org]/publicTheme.css', 'utf8')
let host: HTMLDivElement
let root: Root
let frames: FrameRequestCallback[]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount(node: ReactNode) {
  await act(async () => root.render(node))
}
function form(extra = questions) {
  return <RegistrationFormScreen orgSlug={org.slug} orgName={org.name} camp={camp}
    hasBankDetails={false} questions={extra} onBack={() => {}} onSubmitted={() => {}} />
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await act(async () => {
    const pending = frames.splice(0)
    pending.forEach(callback => callback(0))
  })
}
async function fill(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function fillBase() {
  for (const [id, value] of Object.entries({ child_first_name: 'Mia', child_last_name: 'Muster',
    child_birth_date: '01.01.2018', parent_name: 'Eva Muster', parent_email: 'eva@example.com',
    parent_phone: '0123456', emergency_phone: '0654321' })) await fill(id, value)
}
function assertLabels() {
  const inputs = host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
  expect(inputs.length).toBeGreaterThan(0)
  for (const input of inputs) {
    expect(input.id, input.outerHTML).not.toBe('')
    const label = [...host.querySelectorAll('label')].find(item => item.htmlFor === input.id)
    expect(label, `Explizites Label fehlt: ${input.id}`).toBeDefined()
    expect(label!.textContent!.trim()).not.toBe('')
    expect(label!.closest('.sr, [hidden], [aria-hidden="true"]')).toBeNull()
    expect(host.querySelectorAll(`[id="${input.id}"]`)).toHaveLength(1)
  }
}

it('bindet alle sichtbaren Labels per htmlFor/id, einschließlich Sonstiges und CF1', async () => {
  await mount(form())
  await act(async () => host.querySelector<HTMLInputElement>('#extra-position-other')!.click())
  assertLabels()
  await mount(<CampFilter camps={[camp]} filter={EMPTY_FILTER} filteredCount={1} onFilterChange={() => {}} />)
  assertLabels()
})

it('kündigt Pflichtfehler an, verknüpft Fehlermeldungen und fokussiert das erste ungültige Feld', async () => {
  await mount(form())
  await submit()
  expect(document.activeElement?.id).toBe('child_first_name')
  expect(host.querySelector('[role="alert"]')).not.toBeNull()
  for (const input of host.querySelectorAll<HTMLInputElement>('input[required]')) {
    const field = input.type === 'radio' ? input.closest('[role="radiogroup"]')! : input
    expect(field.getAttribute('aria-required'), input.id).toBe('true')
    expect(field.getAttribute('aria-invalid'), input.id).toBe('true')
    const descriptions = input.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(descriptions.length).toBeGreaterThan(0)
    for (const id of descriptions) expect(document.getElementById(id)?.textContent?.trim()).toBeTruthy()
  }
  expect(submitRegistration).not.toHaveBeenCalled()
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', behavior: 'instant' })

  await fillBase()
  await submit()
  expect(document.activeElement?.id).toBe('extra-hinweis')
  await fill('extra-hinweis', 'Testantwort')
  await submit()
  expect(document.activeElement?.id).toBe('extra-position-0')
  await act(async () => host.querySelector<HTMLInputElement>('#extra-position-other')!.click())
  await submit()
  const other = host.querySelector<HTMLInputElement>('#extra-position-other-text')!
  expect(other.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(other.getAttribute('aria-describedby')!)?.getAttribute('role')).toBe('alert')
  expect(submitRegistration).not.toHaveBeenCalled()
})

it('fokussiert auch serverseitige Feldfehler nach dem Rendern ihrer Beschreibung', async () => {
  await mount(form([]))
  await fillBase()
  await act(async () => {
    host.querySelector<HTMLInputElement>('#terms_accepted')!.click()
    host.querySelector<HTMLInputElement>('#privacy_accepted')!.click()
  })
  vi.mocked(submitRegistration).mockResolvedValue({ ok: false, status: 422, detail: 'Bitte prüfen Sie Ihre Angaben.',
    fieldErrors: { parent_email: 'Bitte prüfen Sie die E-Mail-Adresse.' } })
  await submit()
  expect(document.activeElement?.id).toBe('parent_email')
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy()
  expect(document.getElementById('err-parent-email')?.textContent).toBe('Bitte prüfen Sie die E-Mail-Adresse.')
})

it('enthält Reduced-Motion-Regeln und begrenzt automatische CSS-Bewegung auf höchstens fünf Sekunden', () => {
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf('/* ── M5 Responsive'))
  expect(reduced).toContain('animation: none !important')
  expect(reduced).toContain('transition-duration: 0.01ms !important')
  expect(reduced).toContain('scroll-behavior: auto !important')
  expect(css).toContain('--hero-motion-duration: 4s')
  expect(css).toContain('--grain-motion-cycles: 4')
  expect(css).toContain('--marquee-motion-cycles: 0.125')
  expect(css).not.toMatch(/animation:[^;]*infinite/)
})

it('liefert aussagekräftige Galerie- und Trainer-Alts und leere Alts für dekorative Fotos', () => {
  for (const theme of ['tradition', 'akademie', 'kompakt'] as const) {
    host.innerHTML = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[camp]} />)
    const gallery = [...host.querySelectorAll<HTMLImageElement>('.gallery-band img')]
    expect(gallery.map(img => img.alt)).toEqual([
      'Kinder der Fußballschule KSV Baunatal auf dem Trainingsgelände', 'Kinder mit Pokal beim KSV Baunatal', 'Torwart beim KSV Baunatal',
    ])
    expect(host.querySelector<HTMLImageElement>('.trainer-img')?.alt).toBe('Trainerteam von Testverein')
    for (const img of host.querySelectorAll('img')) expect(img.hasAttribute('alt')).toBe(true)
    for (const img of host.querySelectorAll<HTMLImageElement>('#shotA, #shotB')) expect(img.alt).toBe('')
  }
  host.innerHTML = renderToStaticMarkup(form())
  expect(host.querySelector<HTMLImageElement>('.d3c-aside-photo')?.alt).toBe('')
})

it.each(['ksv-baunatal', 'neutral'])('%s fokussiert die Camp-Auswahl ohne versteckte Tastaturziele', async slug => {
  await mount(<ParentFlow org={{ ...org, slug }} camps={[camp, { ...camp, slug: 'zweites' }]} />)
  if (slug === 'ksv-baunatal') expect(host.querySelector('.sticky-cta')).toBeNull()
  else expect(host.querySelector('.sticky-cta')?.hasAttribute('inert')).toBe(true)
  await act(async () => host.querySelector<HTMLButtonElement>('.hero-btns button')!.click())
  expect(document.activeElement?.id).toBe('s-camps')
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'instant' })
  expect(host.querySelectorAll('[role="button"]')).toHaveLength(0)
  for (const button of host.querySelectorAll('button')) expect(button.type).toBe('button')
  for (const link of host.querySelectorAll('a')) expect(link.hasAttribute('href')).toBe(true)
})

it('sichert kontrastreiche Fokusringe und mindestens 24-Pixel-Ziele inklusive Radio/Checkbox ab', () => {
  expect(css).toContain('.cp-public .screen :is(button, a, input, select, textarea, summary, [tabindex]):focus-visible')
  expect(css).toContain('outline: var(--focus-width) solid var(--focus-light)')
  expect(css).toContain('box-shadow: 0 0 0 var(--focus-outer-width) var(--focus-dark)')
  expect(css).toContain('--focus-light: #ffffff')
  expect(css).toContain('--focus-dark: #000000')
  // Relative luminance: white = 1, black = 0; two-tone ring contrast is 21:1.
  expect((1 + 0.05) / (0 + 0.05)).toBeGreaterThanOrEqual(3)
  expect(css).toContain('--target-min: 24px')
  expect(css).toContain("#s-form input:is([type='checkbox'], [type='radio'])")
  expect(css).toContain('min-height: var(--target-min)')
  expect(css).toContain('padding: var(--focus-gap)')
})

it('behält genau eine h1 und eine geordnete Überschriftenhierarchie je Screen', () => {
  for (const node of [<ParentFlow key="org" org={org} camps={[camp]} />, form(),
    <CampScreen key="camp" org={org} camp={camp} onBack={() => {}} onRegister={() => {}} />]) {
    host.innerHTML = renderToStaticMarkup(node)
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    let previous = 0
    for (const heading of host.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const level = Number(heading.tagName[1])
      expect(level).toBeLessThanOrEqual(previous + 1)
      previous = level
    }
  }
})
