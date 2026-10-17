// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import OrganizationConfigForm from './OrganizationConfigForm'
import { updateOrganizationConfigAction, type ConfigActionState } from '../actions/configActions'

vi.mock('../actions/configActions', () => ({
  updateOrganizationConfigAction: vi.fn(),
  setOrganizationPublishedAction: vi.fn(),
}))

const org: OrganizationAdmin = {
  id: 'review-org', slug: 'review', name: 'Review e. V.', legal_name: null, legal_address: null,
  contact_email: 'kontakt@review.example', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: null, plan_status: 'pilot', theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null, billing_notes: null,
  site_published: true,
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(updateOrganizationConfigAction).mockResolvedValue({ error: null, saved: true })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function render() {
  await act(() => root.render(<OrganizationConfigForm orgSlug="review" org={org} brandStrong="#112233" brandOn="#ffffff" />))
}

function dataForm() {
  return container.querySelector<HTMLInputElement>('[name="name"]')!.closest('form')!
}

async function save() {
  await act(async () => {
    dataForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

it('replaces the earlier result with a pending note while the next save runs', async () => {
  await render()
  await save()
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Gespeichert.')

  let release: (state: ConfigActionState) => void = () => {}
  vi.mocked(updateOrganizationConfigAction).mockImplementation(() => new Promise<ConfigActionState>(resolve => { release = resolve }))
  await save()
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Wird gespeichert …')

  await act(async () => release({ error: null, saved: true }))
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Gespeichert.')
})

it('clears a previous error instead of showing it next to a running save', async () => {
  vi.mocked(updateOrganizationConfigAction).mockResolvedValue({ error: 'Try again', saved: false })
  await render()
  await save()
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Try again')

  let release: (state: ConfigActionState) => void = () => {}
  vi.mocked(updateOrganizationConfigAction).mockImplementation(() => new Promise<ConfigActionState>(resolve => { release = resolve }))
  await save()
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Wird gespeichert …')

  await act(async () => release({ error: 'Try again', saved: false }))
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Try again')
})

it('keeps the typed value after a failed save instead of falling back to the stored name', async () => {
  vi.mocked(updateOrganizationConfigAction).mockResolvedValue({ error: 'Try again', saved: false })
  await render()
  const name = container.querySelector<HTMLInputElement>('[name="name"]')!
  name.value = 'Review und Freunde e. V.'
  await save()

  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Try again')
  expect(container.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Review und Freunde e. V.')
})

it('keeps the submit button reachable and labelled while a save runs', async () => {
  let release: (state: ConfigActionState) => void = () => {}
  vi.mocked(updateOrganizationConfigAction).mockImplementation(() => new Promise<ConfigActionState>(resolve => { release = resolve }))
  await render()
  await save()
  const button = dataForm().querySelector<HTMLButtonElement>('button[type="submit"]')!
  expect(button.disabled).toBe(true)
  expect(button.textContent).toBe('Wird gespeichert …')

  await act(async () => release({ error: null, saved: true }))
  expect(button.disabled).toBe(false)
  expect(button.textContent).toBe('Speichern')
})
