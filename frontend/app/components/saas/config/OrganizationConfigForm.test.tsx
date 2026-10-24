// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import OrganizationConfigForm from './OrganizationConfigForm'
import { updateOrganizationConfigAction, type ConfigActionState } from '../actions/configActions'

// Initial jsdom/React form work can exceed five seconds on the shared Windows runner.
vi.setConfig({ testTimeout: 15_000 })

vi.mock('../actions/configActions', () => ({
  updateOrganizationConfigAction: vi.fn(),
  setOrganizationPublishedAction: vi.fn(),
}))

const org: OrganizationAdmin = {
  id: 'review-org', slug: 'review', name: 'Review e. V.', legal_name: null, legal_address: null,
  contact_email: 'kontakt@review.example', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: null, plan_status: 'pilot', theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null, billing_notes: null,
  site_published: true, review_status: 'approved', review_note: null,
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

it('renders trainer_image_url and trainer_text fields with stored org values', async () => {
  const orgWithTrainer = {
    ...org,
    trainer_image_url: 'https://example.com/trainer.jpg',
    trainer_text: 'Unser Trainer hat 10 Jahre Erfahrung.',
  }
  await act(() => root.render(<OrganizationConfigForm orgSlug="review" org={orgWithTrainer} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelector('label[for="trainer_image_url"]')?.textContent).toBe('Trainer-Bild-URL')
  expect(container.querySelector<HTMLInputElement>('[name="trainer_image_url"]')!.value).toBe('https://example.com/trainer.jpg')
  expect(container.querySelector('label[for="trainer_text"]')?.textContent).toBe('Trainer-Text')
  expect(container.querySelector<HTMLTextAreaElement>('[name="trainer_text"]')!.value).toBe('Unser Trainer hat 10 Jahre Erfahrung.')
})

it('renders terms_text field with stored org value', async () => {
  const orgWithTerms = { ...org, terms_text: 'Unsere Stornobedingungen.' }
  await act(() => root.render(<OrganizationConfigForm orgSlug="review" org={orgWithTerms} brandStrong="#112233" brandOn="#ffffff" />))
  const ta = container.querySelector<HTMLTextAreaElement>('[name="terms_text"]')!
  expect(ta).not.toBeNull()
  expect(ta.value).toBe('Unsere Stornobedingungen.')
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


it('shows error under logo_url field when submitted with invalid URL', async () => {
  await render()
  const input = container.querySelector<HTMLInputElement>('[name="logo_url"]')!
  input.value = 'javascript:alert(1)'
  await save()

  const errorEl = container.querySelector('#logo_url-error')
  expect(errorEl).not.toBeNull()
  expect(errorEl!.textContent).toContain('https-Adresse')
})

it('never renders billing notes or the billing section, even with owner data', async () => {
  const ownerOrg = { ...org, billing_notes: 'Private contract terms' }
  await act(() => root.render(<OrganizationConfigForm orgSlug="review" org={ownerOrg} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelector('[name="billing_notes"]')).toBeNull()
  expect(container.textContent).not.toContain('Abrechnung')
  expect(container.textContent).not.toContain('Konditionen')
  expect(container.textContent).not.toContain('Private contract terms')
})
