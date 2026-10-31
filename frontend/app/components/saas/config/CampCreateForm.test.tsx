// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CampCreateForm, { suggestCampSlug } from './CampCreateForm'
import { createCampAction } from '../actions/configActions'
import { prefillCampDuplicate } from './campDuplicate'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'

vi.mock('../actions/configActions', () => ({ createCampAction: vi.fn() }))

let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(createCampAction).mockResolvedValue({ error: 'Bitte erneut versuchen.' })
  await act(() => root.render(<CampCreateForm orgSlug="review" brandStrong="#112233" brandOn="#ffffff" />))
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function enter(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it.each([
  [' Sommer Camp 2027! ', 'sommer-camp-2027'],
  ['Fußball für Mädchen & Jungs', 'fussball-fuer-maedchen-jungs'],
  ['Élite-Camp', 'elite-camp'],
  ['', ''],
])('suggests a web address for %s', (title, expected) => {
  expect(suggestCampSlug(title)).toBe(expected)
})

it('puts the title first and updates the suggestion until the address is edited', async () => {
  expect(container.querySelector('input')!.name).toBe('title')
  expect(container.querySelector('label[for="slug"]')!.textContent).toBe('Web-Adresse')
  await enter('title', 'Sommer Camp')
  expect(container.querySelector<HTMLInputElement>('[name="slug"]')!.value).toBe('sommer-camp')
  await enter('title', 'Herbst Camp')
  expect(container.querySelector<HTMLInputElement>('[name="slug"]')!.value).toBe('herbst-camp')
  await enter('slug', 'mein-camp')
  await enter('title', 'Winter Camp')
  expect(container.querySelector<HTMLInputElement>('[name="slug"]')!.value).toBe('mein-camp')
})

it('offers no immediate publication and explains the draft', () => {
  expect(container.querySelector('[name="publish_now"]')).toBeNull()
  expect(container.querySelector('[type="checkbox"]')).toBeNull()
  expect(container.textContent).toContain('als Entwurf angelegt')
})

it('CampCreateForm enthält kein Du in Texten (B1 – Siezen)', () => {
  const DU_WORDS = /\b(du|dein|deine|deinem|deinen|ergänze|prüfe)\b/i
  expect(container.textContent).not.toMatch(DU_WORDS)
  // Hints are in aria-describedby elements; check their text too
  const hints = Array.from(container.querySelectorAll('[id$="-hint"]'))
  for (const hint of hints) {
    expect(hint.textContent).not.toMatch(DU_WORDS)
  }
})

it('keeps all input values after an error and resubmits them', async () => {
  const fields = { title: 'Mein Camp', slug: 'meine-adresse', start_date: '2027-07-05', end_date: '2027-07-09', age_min: '6', age_max: '12', capacity: '20', price_euros: '149.50' }
  for (const [name, value] of Object.entries(fields)) await enter(name, value)
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => container.querySelector('form')!.requestSubmit())
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Bitte erneut versuchen.')
    for (const [name, value] of Object.entries(fields)) {
      expect(container.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value).toBe(value)
      expect(vi.mocked(createCampAction).mock.calls[attempt][2].get(name)).toBe(value)
    }
  }
})

it('zeigt die Kopie mit leeren Pflichtterminen und übergibt bearbeitete Angaben', async () => {
  const source = { ...getPreviewFixtures().camps[0], location: 'Sportplatz', includes: ['Ball', 'Trikot'], registration_start: '2026-01-01T08:00:00Z', currency: 'CHF' }
  const values = prefillCampDuplicate(source)
  await act(() => root.render(<CampCreateForm key="copy" orgSlug="review" initialValues={values} brandStrong="#112233" brandOn="#ffffff" />))
  const input = (name: string) => container.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  expect(input('title').value).toBe(`${source.title} (Kopie)`)
  expect(input('slug').value).toBe(values.slug)
  for (const name of ['start_date', 'end_date']) {
    expect(input(name).value).toBe('')
    expect(input(name).required).toBe(true)
  }
  for (const name of ['age_min', 'age_max', 'capacity'] as const) expect(input(name).value).toBe(String(source[name]))
  expect(input('price_euros').value).toBe((source.price_cents / 100).toFixed(2))
  expect(input('location').value).toBe('Sportplatz')
  expect(input('includes').value).toBe('Ball\nTrikot')
  expect(input('currency').value).toBe('CHF')
  expect(container.querySelector('label[for="price_euros"]')!.textContent).toBe('Preis')
  expect(container.querySelector('#price_euros-hint')!.textContent).toContain('angegebenen Währung')
  expect(container.textContent).not.toMatch(/\b(du|dein\w*|dir|dich|prüfe|ergänze|wähle)\b/i)
  await enter('title', 'Neuer Termin')
  expect(input('slug').value).toBe('neuer-termin')
  await enter('start_date', '2027-08-02')
  await enter('end_date', '2027-08-06')
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => container.querySelector('form')!.requestSubmit())
    const data = vi.mocked(createCampAction).mock.calls[attempt][2]
    expect(data.get('duplicate')).toBe('1')
    expect(data.get('start_date')).toBe('2027-08-02')
    expect(data.get('end_date')).toBe('2027-08-06')
    expect(data.get('registration_start')).toBe('2026-01-01T08:00:00.000Z')
    expect(data.get('location')).toBe('Sportplatz')
    expect(data.get('includes')).toBe('Ball\nTrikot')
    expect(data.get('currency')).toBe('CHF')
  }
})

it('öffnet das neue Camp mit vollem Seitenaufruf und bleibt bis dahin im Wartezustand', async () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  vi.mocked(createCampAction).mockResolvedValueOnce({ error: null, redirectTo: '/pilot/review/camps/sommer/konfiguration?created=1' })
  for (const [name, value] of [['title', 'Sommer'], ['start_date', '2027-07-05'], ['end_date', '2027-07-09'], ['age_min', '6'], ['age_max', '12'], ['capacity', '20'], ['price_euros', '149']]) await enter(name, value)
  await act(async () => { container.querySelector('form')!.requestSubmit() })
  expect(assign).toHaveBeenCalledWith('/pilot/review/camps/sommer/konfiguration?created=1')
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  vi.unstubAllGlobals()
})
