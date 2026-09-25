// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import CampConfigForm from './CampConfigForm'
import { updateCampConfigAction } from '../actions/configActions'

vi.mock('../actions/configActions', () => ({ updateCampConfigAction: vi.fn() }))

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
  vi.mocked(updateCampConfigAction).mockResolvedValue({ error: null, saved: true, status: 'published' })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

it('sends registration deadlines as explicit instants, not server-local wall times', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(updateCampConfigAction).toHaveBeenCalledOnce()
  const submitted = vi.mocked(updateCampConfigAction).mock.calls[0][3]
  expect(submitted.get('registration_start')).toBe(new Date(camp.registration_start!).toISOString())
  expect(submitted.get('registration_end')).toBe(new Date(camp.registration_end!).toISOString())
})

it('retains the confirmed publication state over repeated saves', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  container.querySelector<HTMLSelectElement>('[name="status"]')!.value = 'published'
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector<HTMLSelectElement>('[name="status"]')!.value).toBe('published')
  container.querySelector<HTMLSelectElement>('[name="status"]')!.value = 'draft'
  vi.mocked(updateCampConfigAction).mockResolvedValue({ error: null, saved: true, status: 'draft' })
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector<HTMLSelectElement>('[name="status"]')!.value).toBe('draft')
})

it('keeps entered values when saving fails', async () => {
  vi.mocked(updateCampConfigAction).mockResolvedValue({ error: 'Try again', saved: false })
  await act(() => root.render(<CampConfigForm orgSlug="review" camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  container.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Changed title'
  container.querySelector<HTMLSelectElement>('[name="status"]')!.value = 'published'
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.textContent).toContain('Try again')
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Changed title')
  expect(container.querySelector<HTMLSelectElement>('[name="status"]')!.value).toBe('published')
})

it('keeps saved values until fresh server props arrive, then accepts those props', async () => {
  await act(() => root.render(<CampConfigForm orgSlug="review" camp={camp} brandStrong="#112233" brandOn="#ffffff" />))
  container.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Changed title'
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Changed title')
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(vi.mocked(updateCampConfigAction).mock.calls[1][3].get('title')).toBe('Changed title')
  await act(() => root.render(<CampConfigForm orgSlug="review" camp={{ ...camp, title: 'Confirmed title' }} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelector<HTMLInputElement>('[name="title"]')!.defaultValue).toBe('Confirmed title')
})
