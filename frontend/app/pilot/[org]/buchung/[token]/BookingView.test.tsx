// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BookingView from './BookingView'
import * as api from '../../../../lib/saasApi'

vi.mock('../../../../lib/saasApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/saasApi')>()),
  fetchBookingStatus: vi.fn(),
  requestBookingCancellation: vi.fn(),
}))

const base: api.BookingStatus = {
  camp_title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09', starts_at: null,
  child_first_name: 'Kim', status: 'registered', payment_status: 'open', amount_cents: 14900, currency: 'EUR',
  cancellation_requested_at: null, invoice_available: false,
}
const contact = { name: 'KSV Test', contact_email: 'verein@example.com', contact_phone: '0561 1' }
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
  vi.clearAllMocks()
})

async function show(data: Partial<api.BookingStatus> = {}) {
  vi.mocked(api.fetchBookingStatus).mockResolvedValue({ kind: 'ok', data: { ...base, ...data } })
  await act(async () => { root.render(<BookingView orgSlug="ksv" token="tok" org={contact} />) })
}
const text = () => container.textContent ?? ''
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent === label)

describe('BookingView', () => {
  it('shows the booking in Sie-Form with payment status and amount', async () => {
    await show()
    expect(text()).toContain('Sommercamp')
    expect(text()).toContain('Kim')
    expect(text()).toContain('Angemeldet')
    expect(text()).toContain('Zahlung offen')
    expect(text()).toContain('149,00')
    expect(text()).toMatch(/Ihre Anmeldung/)
    expect(text()).not.toMatch(/\bdu\b|\bdein/i)
  })

  it.each([
    ['waitlist', 'Warteliste'], ['cancelled', 'Storniert'],
  ] as const)('shows status %s', async (status, label) => {
    await show({ status })
    expect(text()).toContain(label)
  })

  it('shows paid status and the invoice hint', async () => {
    await show({ payment_status: 'paid', invoice_available: true })
    expect(text()).toContain('Bezahlt')
    expect(text()).toContain('Rechnung')
  })

  it('asks for confirmation inside the page before sending the request (no window.confirm)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(api.requestBookingCancellation).mockResolvedValue({ kind: 'ok', cancellationRequestedAt: '2027-06-01T10:00:00Z' })
    await show()
    await act(() => button('Stornierung anfragen')!.click())
    expect(api.requestBookingCancellation).not.toHaveBeenCalled()
    expect(text()).toContain('Möchten Sie')
    expect(button('Abbrechen')).toBeDefined()
    await act(() => button('Ja, Stornierung anfragen')!.click())
    expect(api.requestBookingCancellation).toHaveBeenCalledWith('ksv', 'tok')
    expect(text()).toContain('Wir haben Ihre Anfrage')
    expect(text()).toContain('Der Verein meldet sich bei Ihnen')
    expect(button('Stornierung anfragen')).toBeUndefined()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('can back out of the confirmation step', async () => {
    await show()
    await act(() => button('Stornierung anfragen')!.click())
    await act(() => button('Abbrechen')!.click())
    expect(button('Stornierung anfragen')).toBeDefined()
    expect(api.requestBookingCancellation).not.toHaveBeenCalled()
  })

  it('shows the pending request instead of the button when one exists', async () => {
    await show({ cancellation_requested_at: '2027-06-01T10:00:00Z' })
    expect(text()).toContain('Stornierung angefragt')
    expect(text()).toContain('Der Verein meldet sich bei Ihnen')
    expect(button('Stornierung anfragen')).toBeUndefined()
  })

  it('offers no cancellation for cancelled bookings', async () => {
    await show({ status: 'cancelled' })
    expect(button('Stornierung anfragen')).toBeUndefined()
  })

  it('shows an error and keeps the button when the request fails', async () => {
    vi.mocked(api.requestBookingCancellation).mockResolvedValue({ kind: 'error' })
    await show()
    await act(() => button('Stornierung anfragen')!.click())
    await act(() => button('Ja, Stornierung anfragen')!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('nicht möglich')
    expect(text()).toContain('verein@example.com')
  })

  it('treats a 409 as already cancelled', async () => {
    vi.mocked(api.requestBookingCancellation).mockResolvedValue({ kind: 'already_cancelled' })
    await show()
    await act(() => button('Stornierung anfragen')!.click())
    await act(() => button('Ja, Stornierung anfragen')!.click())
    expect(text()).toContain('Storniert')
    expect(button('Stornierung anfragen')).toBeUndefined()
  })

  it('shows a neutral not-found message without revealing why', async () => {
    vi.mocked(api.fetchBookingStatus).mockResolvedValue({ kind: 'not_found' })
    await act(async () => { root.render(<BookingView orgSlug="ksv" token="tok" org={contact} />) })
    expect(text()).toContain('Diese Anmeldung konnten wir nicht finden')
    expect(text()).toContain('verein@example.com')
  })

  it('shows a retry hint on load errors and rate limits', async () => {
    vi.mocked(api.fetchBookingStatus).mockResolvedValue({ kind: 'rate_limited' })
    await act(async () => { root.render(<BookingView orgSlug="ksv" token="tok" org={contact} />) })
    expect(text()).toContain('später erneut')
  })
})
