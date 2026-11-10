import { afterEach, expect, it, vi } from 'vitest'
import { fetchBookingStatus, cancelBookingAsParent } from './saasApi'

afterEach(() => vi.unstubAllGlobals())

const token = '11111111-1111-4111-8111-111111111111'
const status = {
  camp_title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09', starts_at: null,
  child_first_name: 'Kim', status: 'registered', payment_status: 'open', amount_cents: 14900, currency: 'EUR',
  cancellation_requested_at: null, invoice_available: false,
  self_cancel: { possible: true, reason: 'ok', deadline: '2027-06-21', refund_cents: 14900, days: 14 },
}

it('loads the booking status without caching and escapes path parts', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(status), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await fetchBookingStatus('club', token)).toEqual({ kind: 'ok', data: status })
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toMatch(new RegExp(`/api/v1/organizations/club/registrations/${token}$`))
  expect(init).toMatchObject({ cache: 'no-store' })
})

it.each([[404, 'not_found'], [422, 'not_found'], [429, 'rate_limited'], [500, 'error']])('maps HTTP %s to %s', async (code, kind) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: code })))
  expect(await fetchBookingStatus('club', token)).toEqual({ kind })
})

it('maps a network failure to error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  expect(await fetchBookingStatus('club', token)).toEqual({ kind: 'error' })
})

it('posts to /cancel and returns the booking', async () => {
  const cancelled = { ...status, status: 'cancelled' }
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(cancelled), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await cancelBookingAsParent('club', token)).toEqual({ kind: 'ok', data: cancelled })
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toMatch(new RegExp(`/registrations/${token}/cancel$`))
  expect(init.method).toBe('POST')
})

it('passes the server message on 409 and 502', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Bitte wenden Sie sich an den Verein.' }), { status: 409 })))
  expect(await cancelBookingAsParent('club', token)).toEqual({ kind: 'not_allowed', message: 'Bitte wenden Sie sich an den Verein.' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Nicht storniert.' }), { status: 502 })))
  expect(await cancelBookingAsParent('club', token)).toEqual({ kind: 'refund_failed', message: 'Nicht storniert.' })
})

it.each([[404, 'not_found'], [429, 'rate_limited'], [500, 'error']])('maps cancel HTTP %s to %s', async (code, kind) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: code })))
  expect(await cancelBookingAsParent('club', token)).toEqual({ kind })
})
