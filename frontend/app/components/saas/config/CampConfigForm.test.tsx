// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import CampConfigForm from './CampConfigForm'
import { updateCampConfigAction, type ConfigActionState } from '../actions/configActions'

// Initial jsdom/React form work can exceed five seconds on the shared Windows runner.
vi.setConfig({ testTimeout: 15_000 })

vi.mock('../actions/configActions', () => ({ updateCampConfigAction: vi.fn() }))

const org = { site_published: true, contact_email: 'review@example.com', iban: null, terms_text: null }
const camp: CampAdmin = {
  id: 'review-camp', organization_id: 'review-org', slug: 'summer', title: 'Review camp',
  start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: '2027-06-01T10:00:00+02:00', registration_end: '2027-07-01T18:00:00+02:00',
  age_min: 6, age_max: 12, capacity: 20, price_cents: 14900, currency: 'EUR', status: 'draft',
  location: null, care_info: null, meals_info: null, includes: null,
}
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(updateCampConfigAction).mockImplementation(async (_org, _slug, _prev, data) => {
    const saved = { ...camp, title: String(data.get('title')), status: data.get('status') as CampAdmin['status'] }
    return { error: null, saved: true, status: saved.status, camp: saved }
  })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

it('sends registration deadlines as explicit instants, not server-local wall times', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(updateCampConfigAction).toHaveBeenCalledOnce()
  const submitted = vi.mocked(updateCampConfigAction).mock.calls[0][3]
  expect(submitted.get('registration_start')).toBe(new Date(camp.registration_start!).toISOString())
  expect(submitted.get('registration_end')).toBe(new Date(camp.registration_end!).toISOString())
})

it('publishes explicitly and retains the confirmed state over repeated saves', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelector('select[name="status"]')).toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>('[value="published"]')!.click())
  expect(vi.mocked(updateCampConfigAction).mock.calls[0][3].get('status')).toBe('published')
  expect(container.textContent).toContain('Camp ist für Eltern erreichbar')
  await act(async () => container.querySelector('form')!.requestSubmit())
  expect(vi.mocked(updateCampConfigAction).mock.calls[1][3].get('status')).toBe('published')
  await act(async () => container.querySelector<HTMLButtonElement>('[value="draft"]')!.click())
  expect(vi.mocked(updateCampConfigAction).mock.calls[2][3].get('status')).toBe('draft')
  expect(container.textContent).not.toContain('Camp ist für Eltern erreichbar')
})
it('keeps entered values when saving fails', async () => {
  vi.mocked(updateCampConfigAction).mockResolvedValue({ error: 'Try again', saved: false })
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  container.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Changed title'

  await act(async () => {
    container.querySelector<HTMLButtonElement>('[value="published"]')!.click()
  })
  expect(container.textContent).toContain('Try again')
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Changed title')
  expect(container.textContent).not.toContain('Camp ist für Eltern erreichbar')
  expect(container.querySelector('[value="published"]')).not.toBeNull()
})

it('replaces the earlier result with a pending note while the next save runs', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Gespeichert.')

  let release: (state: ConfigActionState) => void = () => {}
  vi.mocked(updateCampConfigAction).mockImplementation(() => new Promise<ConfigActionState>(resolve => { release = resolve }))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Wird gespeichert …')

  await act(async () => release({ error: null, saved: true, status: 'draft' }))
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Gespeichert.')
})

it('clears a previous error instead of showing it next to a running save', async () => {
  vi.mocked(updateCampConfigAction).mockResolvedValue({ error: 'Try again', saved: false })
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Try again')

  let release: (state: ConfigActionState) => void = () => {}
  vi.mocked(updateCampConfigAction).mockImplementation(() => new Promise<ConfigActionState>(resolve => { release = resolve }))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Wird gespeichert …')

  await act(async () => release({ error: 'Try again', saved: false }))
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Try again')
})

it('keeps saved values until fresh server props arrive, then accepts those props', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  container.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Changed title'
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Changed title')
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(vi.mocked(updateCampConfigAction).mock.calls[1][3].get('title')).toBe('Changed title')
  await act(() => root.render(<CampConfigForm orgSlug="review" org={org} camp={{ ...camp, title: 'Confirmed title' }} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.defaultValue).toBe('Confirmed title')
})
