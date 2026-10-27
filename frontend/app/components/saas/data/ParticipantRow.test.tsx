// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import ParticipantRow from './ParticipantRow'
import { updateRegistrationDetailsAction } from '../actions/waitlistActions'

vi.mock('../actions/waitlistActions', () => ({
  cancelRegistrationAction: vi.fn(),
  updateRegistrationDetailsAction: vi.fn(),
}))

const registration: RegistrationAdmin = {
  payment_reference: 'CP-12345678',
  id: 'review-registration', registration_token: 'review-token', status: 'registered', payment_status: 'open',
  parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'test@example.com', parent_phone: '123',
  child_first_name: 'Test', child_last_name: 'Child', child_birth_date: '2018-05-10',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
  jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(updateRegistrationDetailsAction).mockImplementation(async (_org, _camp, _token, _state, data) => ({
    error: null, saved: true,
    registration: { ...registration, child_first_name: String(data.get('child_first_name')), jersey_size: String(data.get('jersey_size')) },
  }))
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function render(row = registration) {
  await act(() => root.render(<ParticipantRow registration={row} selected={false} onToggleSelect={() => {}}
    brandColor="#112233" orgSlug="review-club" campSlug="review-camp" campTitle="Review Camp" />))
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === label)
  expect(button, `Missing button: ${label}`).toBeDefined()
  await act(() => button!.click())
}

async function saveFirstEdit() {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  await act(() => trigger.click())
  await click('Bearbeiten')
  const input = container.querySelector<HTMLInputElement>('[name="child_first_name"]')!
  input.value = 'Corrected'
  container.querySelector<HTMLInputElement>('[name="jersey_size"]')!.value = '140'
  await act(async () => {
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(updateRegistrationDetailsAction).toHaveBeenCalledOnce()
  expect(container.textContent).toContain('Corrected')
}

it('renders the expand trigger with a transparent border (no double-border in the roster card)', async () => {
  await render()
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  expect(trigger.style.border).toBe('1px solid transparent')
})

it('shows configured position and origin answers in participant detail', async () => {
  const questions = [
    { key: 'position', label: 'Position', type: 'choice' as const, options: ['Feldspieler', 'Torwart'], other_label: null, required: true },
    { key: 'verein', label: 'Herkunftsverein', type: 'choice' as const, options: ['KSV Baunatal', 'Kein Verein'], other_label: 'Anderer Verein', required: false },
  ]
  await act(() => root.render(<ParticipantRow registration={{ ...registration, extra_answers: { position: 'Torwart', verein: 'FC Teststadt' } }}
    selected={false} onToggleSelect={() => {}} brandColor="#112233" orgSlug="review-club" campSlug="review-camp"
    campTitle="Review Camp" questions={questions} />))
  await act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click())
  const section = container.querySelector('section[aria-label="Zusatzantworten"]')!
  expect(section.textContent).toContain('Position')
  expect(section.textContent).toContain('Torwart')
  expect(section.textContent).toContain('Herkunftsverein')
  expect(section.textContent).toContain('FC Teststadt')
})

describe('participant correction workflow', () => {
  it('allows a second edit after a successful save without reloading', async () => {
    await render()
    await saveFirstEdit()
    await click('Bearbeiten')
    const input = container.querySelector<HTMLInputElement>('[name="child_first_name"]')
    expect(input).not.toBeNull()
    expect(input!.value).toBe('Corrected')
    input!.value = 'Corrected twice'
    await act(async () => {
      input!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(updateRegistrationDetailsAction).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Corrected twice')
  })

  it('accepts fresh server payment and cancellation state after a correction', async () => {
    await render()
    await saveFirstEdit()
    await render({ ...registration, child_first_name: 'Corrected', payment_status: 'paid', status: 'cancelled' })
    expect(container.textContent).toContain('Bezahlt')
    expect([...container.querySelectorAll('button')].some(b => b.textContent?.toLowerCase().includes('stornieren'))).toBe(false)
  })
})
