import { afterEach, expect, it, vi } from 'vitest'
import { fetchBookingStatus, requestBookingCancellation } from './saasApi'

afterEach(() => vi.unstubAllGlobals())

const token = '11111111-1111-4111-8111-111111111111'
const status = {
  camp_title: 'Sommercamp', start_date: '2027-07-05', end_date: '2027-07-09', starts_at: null,
  child_first_name: 'Kim', status: 'registered', payment_status: 'open', amount_cents: 14900, currency: 'EUR',
  cancellation_requested_at: null, invoice_available: false,
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

it('posts the cancellation request and returns the timestamp', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ cancellation_requested_at: '2027-06-01T10:00:00Z' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await requestBookingCancellation('club', token)).toEqual({ kind: 'ok', cancellationRequestedAt: '2027-06-01T10:00:00Z' })
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toMatch(/\/registrations\/.+\/cancellation-request$/)
  expect(init.method).toBe('POST')
})

it.each([[409, 'already_cancelled'], [404, 'not_found'], [429, 'rate_limited'], [500, 'error']])('maps cancellation HTTP %s to %s', async (code, kind) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: code })))
  expect(await requestBookingCancellation('club', token)).toEqual({ kind })
})
