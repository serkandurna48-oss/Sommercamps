// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { de, publicUI } from '../../../lib/i18n/de'
import { cancelRegistrationAction, promoteWaitlistAction } from '../actions/waitlistActions'
import RegistrationActionFeedback from '../ui/RegistrationActionFeedback'
import ParticipantList from './ParticipantList'
import WaitlistCard from './WaitlistCard'

vi.mock('../actions/waitlistActions', () => ({
  cancelRegistrationAction: vi.fn(),
  promoteWaitlistAction: vi.fn(),
  updateRegistrationDetailsAction: vi.fn(),
}))
vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

const child: RegistrationAdmin = {
  id: 'child', registration_token: 'child-token', status: 'registered', payment_status: 'paid',
  parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'parent@example.com', parent_phone: '123',
  child_first_name: 'Mia', child_last_name: 'Test', child_birth_date: '2018-05-10',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
  jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
}
const waiting: RegistrationAdmin = {
  ...child, id: 'waiting', registration_token: 'waiting-token', status: 'waitlist', payment_status: 'open',
  child_first_name: 'Noah', parent_email: 'waiting@example.com',
}
const promoted = { registration_token: waiting.registration_token, status: 'registered', payment_status: 'open' }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.resetAllMocks()
})

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(button, `Missing button: ${label}`).toBeDefined()
  await act(() => button!.click())
}
async function submit() {
  const form = container.querySelector('form')
  expect(form).not.toBeNull()
  await act(async () => { form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}
async function renderParticipants(registrations = [child]) {
  await act(() => root.render(<ParticipantList registrations={registrations} orgSlug="club" campSlug="camp"
    campTitle="Sommercamp" brandColor="#112233" />))
}
async function renderWaitlist(waitlisted = [waiting], registeredCount = 1) {
  await act(() => root.render(
    <RegistrationActionFeedback registrations={waitlisted} waitlistHref="/pilot/club/camps/camp/warteliste">
      {waitlisted.length ? <WaitlistCard orgSlug="club" campSlug="camp" campTitle="Sommercamp" waitlisted={waitlisted}
        capacity={2} registeredCount={registeredCount} priceCents={12900} currency="EUR"
        brandColor="#112233" brandStrong="#112233" brandOn="#ffffff" /> : <p>Niemand wartet.</p>}
    </RegistrationActionFeedback>,
  ))
}

it('cancels only after confirmation and explains payment, promotion and refund consequences', async () => {
  vi.mocked(cancelRegistrationAction).mockResolvedValue({ error: null, success: 'Anmeldung storniert.', promoted: null })
  await renderParticipants()
  await click('Anmeldung stornieren')
  expect(cancelRegistrationAction).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Anmeldung von Mia Test für Sommercamp stornieren?')
  expect(container.textContent).toContain('Zahlungsstatus: Bezahlt')
  expect(container.textContent).toContain('Ein frei werdender Platz geht automatisch an die nächste Anmeldung auf der Warteliste. Eine Rückzahlung wird dadurch nicht ausgeführt.')
  expect(container.querySelector('section[aria-label="Anmeldung stornieren"] button[type="submit"]')?.className).toContain('cp-btn-quiet-danger')
  await submit()
  expect(cancelRegistrationAction).toHaveBeenCalledOnce()
  expect(cancelRegistrationAction).toHaveBeenCalledWith('club', 'camp', child.registration_token, expect.any(Object))
})

it('Behalten closes confirmation without cancelling', async () => {
  await renderParticipants()
  await click('Anmeldung stornieren')
  await click('Behalten')
  expect(cancelRegistrationAction).not.toHaveBeenCalled()
  expect(container.querySelector('form')).toBeNull()
  expect(container.textContent).not.toContain('Zahlungsstatus:')
})

it.each([false, true])('keeps cancellation result after the action disappears (promoted=%s)', async hasPromoted => {
  vi.mocked(cancelRegistrationAction).mockResolvedValue({ error: null, success: 'Anmeldung storniert.', promoted: hasPromoted ? promoted : null })
  await renderParticipants(hasPromoted ? [child, waiting] : [child])
  await click('Anmeldung stornieren')
  await submit()
  await renderParticipants([{ ...child, status: 'cancelled' }])
  expect(container.querySelector('section[aria-label="Anmeldung stornieren"]')).toBeNull()
  const result = container.querySelector('[role="status"]')!
  expect(result.textContent).toContain('Mia Test storniert.')
  if (hasPromoted) {
    expect(result.textContent).toContain('Noah Test hat den Platz erhalten – Eltern jetzt informieren.')
    expect(result.querySelector('a')?.getAttribute('href')).toBe('mailto:waiting@example.com')
  } else {
    expect(result.querySelector('a')).toBeNull()
  }
  await renderParticipants([])
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Mia Test storniert.')
})

it('links to the waitlist when the promoted parent contact is unavailable', async () => {
  vi.mocked(cancelRegistrationAction).mockResolvedValue({ error: null, success: 'Anmeldung storniert.', promoted })
  await renderParticipants([child, { ...waiting, parent_email: '' }])
  await click('Anmeldung stornieren')
  await submit()
  const link = container.querySelector('[role="status"] a')!
  expect(link.textContent).toBe('Zur Warteliste')
  expect(link.getAttribute('href')).toBe('/pilot/club/camps/camp/warteliste')
})

it.each([2, 3])('shows the capacity hint instead of a promote button at occupancy %s', async registeredCount => {
  await renderWaitlist([waiting], registeredCount)
  expect(container.textContent).toContain('Alle Plätze belegt – nach einer Stornierung rückt das nächste Kind automatisch nach.')
  expect(container.querySelector('button')).toBeNull()
  expect(promoteWaitlistAction).not.toHaveBeenCalled()
})

it('names the next child and confirms camp, price and manual notification', async () => {
  vi.mocked(promoteWaitlistAction).mockResolvedValue({ error: null, success: 'Platz vergeben.', promoted })
  await renderWaitlist()
  await click('Platz an Noah Test vergeben')
  expect(promoteWaitlistAction).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Platz an Noah Test für Sommercamp vergeben?')
  expect(container.textContent?.replace(/\s/g, ' ')).toContain('Preis: 129,00 €')
  expect(container.textContent).toContain('Eltern werden nicht automatisch benachrichtigt')
  await submit()
  expect(promoteWaitlistAction).toHaveBeenCalledOnce()
  await renderWaitlist([])
  const result = container.querySelector('[role="status"]')!
  expect(result.textContent).toContain('Noah Test hat den Platz erhalten – Eltern jetzt informieren.')
  expect(result.querySelector('a')?.textContent).toBe('Eltern informieren')
  expect(result.querySelector('a')?.getAttribute('href')).toBe('mailto:waiting@example.com')
})

it('keeps a failed cancellation retryable without reporting success', async () => {
  vi.mocked(cancelRegistrationAction).mockResolvedValue({ error: 'Bitte erneut versuchen.', success: null })
  await renderParticipants()
  await click('Anmeldung stornieren')
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Bitte erneut versuchen.')
  expect(container.querySelector('[role="status"]')).toBeNull()
  expect(container.querySelector('form')).toBeNull()
})

it('admin hints and parent FAQ agree that promotion sends no automatic message', () => {
  expect(de.waitlistPage.promoteHint).toContain('nicht automatisch benachrichtigt')
  const faq = publicUI.faq.find(item => item.q.includes('ausgebucht'))!
  expect(faq.a).toContain('keine automatische E-Mail')
  expect(faq.a).toContain('der Verein meldet sich')
})