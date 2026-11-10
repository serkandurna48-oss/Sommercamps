// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BookingView from './BookingView'
import * as api from '../../../../lib/saasApi'

vi.mock('../../../../lib/saasApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/saasApi')>()),
  fetchBookingStatus: vi.fn(),
  cancelBookingAsParent: vi.fn(),
}))

const base: api.BookingStatus = {
  camp_title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09', starts_at: null,
  child_first_name: 'Kim', status: 'registered', payment_status: 'open', amount_cents: 14900, currency: 'EUR',
  cancellation_requested_at: null, invoice_available: false,
  self_cancel: { possible: false, reason: 'not_paid_online', deadline: null, refund_cents: null, days: 14 },
}
const paidOnline: Partial<api.BookingStatus> = {
  payment_status: 'paid',
  self_cancel: { possible: true, reason: 'ok', deadline: '2027-06-21', refund_cents: 14900, days: 14 },
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

  it('offers self-cancel with refund only when paid online, confirmed inside the page (no window.confirm)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(api.cancelBookingAsParent).mockResolvedValue({
      kind: 'ok', data: { ...base, ...paidOnline, status: 'cancelled', cancellation_requested_at: '2027-06-01T10:00:00Z',
        self_cancel: { possible: false, reason: 'already_cancelled', deadline: null, refund_cents: null, days: 14 } },
    })
    await show(paidOnline)
    expect(text()).toContain('21.06.2027')
    expect(text()).not.toContain('Stornierung anfragen')
    await act(() => button('Anmeldung stornieren')!.click())
    expect(api.cancelBookingAsParent).not.toHaveBeenCalled()
    expect(text()).toContain('Sie erhalten 149,00')
    expect(text()).toContain('zurück auf das Zahlungsmittel, mit dem Sie bezahlt haben.')
    expect(button('Abbrechen')).toBeDefined()
    await act(() => button('Ja, Anmeldung stornieren')!.click())
    expect(api.cancelBookingAsParent).toHaveBeenCalledWith('ksv', 'tok')
    expect(text()).toContain('Ihre Anmeldung ist storniert')
    expect(text()).toContain('149,00')
    expect(text()).toContain('Storniert')
    expect(button('Anmeldung stornieren')).toBeUndefined()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('can back out of the confirmation step', async () => {
    await show(paidOnline)
    await act(() => button('Anmeldung stornieren')!.click())
    await act(() => button('Abbrechen')!.click())
    expect(button('Anmeldung stornieren')).toBeDefined()
    expect(api.cancelBookingAsParent).not.toHaveBeenCalled()
  })

  it('explains transfer and cash bookings and names the club contact, without a button', async () => {
    await show({ payment_status: 'paid' })
    expect(text()).toContain('Bei Überweisung oder Barzahlung storniert der Verein Ihre Anmeldung.')
    expect(text()).toContain('Bitte wenden Sie sich an KSV Test')
    expect(text()).toContain('verein@example.com')
    expect(button('Anmeldung stornieren')).toBeUndefined()
  })

  it('explains the deadline with date once it has passed', async () => {
    await show({ payment_status: 'paid', self_cancel: { possible: false, reason: 'deadline_passed', deadline: '2027-06-21', refund_cents: null, days: 14 } })
    expect(text()).toContain('Eine Stornierung ist bis 14 Tage vor Campbeginn (bis zum 21.06.2027) möglich.')
    expect(text()).toContain('Bitte wenden Sie sich an KSV Test')
    expect(button('Anmeldung stornieren')).toBeUndefined()
  })

  it('lets waitlist entries leave the waitlist without refund text', async () => {
    vi.mocked(api.cancelBookingAsParent).mockResolvedValue({
      kind: 'ok', data: { ...base, status: 'cancelled', self_cancel: { possible: false, reason: 'already_cancelled', deadline: null, refund_cents: null, days: 14 } },
    })
    await show({ status: 'waitlist', self_cancel: { possible: true, reason: 'waitlist', deadline: null, refund_cents: null, days: 14 } })
    await act(() => button('Von der Warteliste abmelden')!.click())
    expect(text()).toContain('Es entstehen keine Kosten')
    expect(text()).not.toContain('zurück auf das Zahlungsmittel')
    await act(() => button('Ja, von der Warteliste abmelden')!.click())
    expect(text()).toContain('Sie stehen nicht mehr auf der Warteliste')
  })

  it('explains an unfinished online payment instead of the transfer text', async () => {
    await show({ self_cancel: { possible: false, reason: 'payment_pending', deadline: null, refund_cents: null, days: 14 } })
    expect(text()).toContain('Die Zahlung ist noch nicht abgeschlossen. Zum Stornieren wenden Sie sich bitte an KSV Test')
    expect(text()).not.toContain('Überweisung')
  })

  it('names the club contact only once when cancelling is not possible', async () => {
    await show({ payment_status: 'paid' })
    expect(text().match(/verein@example\.com/g)).toHaveLength(1)
    expect(text()).not.toContain('Bei Fragen erreichen Sie')
  })

  it('sends only one request on a double click', async () => {
    let resolve!: (value: api.ParentCancelResult) => void
    vi.mocked(api.cancelBookingAsParent).mockReturnValue(new Promise(r => { resolve = r }))
    await show(paidOnline)
    await act(() => button('Anmeldung stornieren')!.click())
    const yes = button('Ja, Anmeldung stornieren')!
    await act(async () => { yes.click(); yes.click() })
    expect(api.cancelBookingAsParent).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ kind: 'error' }) })
  })

  it('offers no cancellation for cancelled bookings', async () => {
    await show({ status: 'cancelled', self_cancel: { possible: false, reason: 'already_cancelled', deadline: null, refund_cents: null, days: 14 } })
    expect(button('Anmeldung stornieren')).toBeUndefined()
    expect(text()).toContain('Diese Anmeldung ist storniert')
  })

  it('shows the server message and keeps the booking when the refund fails', async () => {
    vi.mocked(api.cancelBookingAsParent).mockResolvedValue({ kind: 'refund_failed', message: 'Ihre Anmeldung wurde nicht storniert. Bitte wenden Sie sich an den Verein.' })
    await show(paidOnline)
    await act(() => button('Anmeldung stornieren')!.click())
    await act(() => button('Ja, Anmeldung stornieren')!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('nicht storniert')
    expect(text()).toContain('verein@example.com')
    expect(text()).not.toContain('Ihre Anmeldung ist storniert')
    expect(button('Anmeldung stornieren')).toBeUndefined() // back in the confirm step so the parent can retry
    expect(button('Ja, Anmeldung stornieren')).toBeDefined()
  })

  it.each([
    [{ kind: 'rate_limited' }, 'Zu viele Anfragen'],
    [{ kind: 'error' }, 'gerade nicht möglich'],
    [{ kind: 'not_allowed', message: 'Eine Stornierung ist bis 14 Tage vor Campbeginn möglich.' }, 'Eine Stornierung ist bis 14 Tage'],
  ] as const)('shows an error for %j', async (result, expected) => {
    vi.mocked(api.cancelBookingAsParent).mockResolvedValue(result)
    await show(paidOnline)
    await act(() => button('Anmeldung stornieren')!.click())
    await act(() => button('Ja, Anmeldung stornieren')!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(expected)
  })

  it('contains no "Stornierung anfragen" flow any more', async () => {
    await show(paidOnline)
    expect(text()).not.toMatch(/anfragen|angefragt/i)
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
