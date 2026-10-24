import { afterEach, expect, it, vi } from 'vitest'
import { fetchCampsAdmin, cancelRegistrationAdmin, setPaymentStatusAdmin, reviewOrganization, removeOrganizationMemberAdmin } from './saasAdminApi'
import { de } from './i18n/de'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const read = () => fetchCampsAdmin('demo', 'test-token')
const unavailable = (header?: string) => new Response('', { status: 503, headers: header === undefined ? {} : { 'Retry-After': header } })

it.each(['30', 'Fri, 01 Jan 2027 00:01:00 GMT'])('caps Retry-After %s at five seconds', async header => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
  const fetch = vi.fn().mockResolvedValueOnce(unavailable(header)).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  const result = read()
  await vi.advanceTimersByTimeAsync(4999)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('surfaces persistent 503 after exactly one retry', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(unavailable('1')))
  vi.stubGlobal('fetch', fetch)
  const result = expect(read()).rejects.toThrow(de.states.serverRestarting)
  await vi.runAllTimersAsync()
  await result
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([400, 403])('does not retry %s even with Retry-After', async status => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status, headers: { 'Retry-After': '1' } }))
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each([502, 503, 504])('maps %s to the German restart message', async status => {
  const fetch = vi.fn().mockResolvedValue(new Response('private server detail', { status }))
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow(de.states.serverRestarting)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each(['invalid', ''])('does not retry unusable Retry-After %s', async header => {
  const fetch = vi.fn().mockResolvedValue(unavailable(header))
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow(de.states.serverRestarting)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('reports offline without sending a request', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow(de.states.offline)
  expect(fetch).not.toHaveBeenCalled()
})

it('reports offline when the connection drops during fetch', async () => {
  vi.stubGlobal('navigator', { onLine: true })
  const fetch = vi.fn().mockImplementation(() => {
    vi.stubGlobal('navigator', { onLine: false })
    return Promise.reject(new TypeError('Failed to fetch'))
  })
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow(de.states.offline)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each([
  new DOMException('timed out', 'TimeoutError'),
  new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
])('retries a timeout once after one second', async error => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  const result = read()
  await vi.advanceTimersByTimeAsync(999)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})

it('shares one retry budget between 503 and timeout', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockResolvedValueOnce(unavailable('1')).mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
  vi.stubGlobal('fetch', fetch)
  const result = expect(read()).rejects.toThrow(de.states.serverRestarting)
  await vi.runAllTimersAsync()
  await result
  expect(fetch).toHaveBeenCalledTimes(2)
})

const mutations = [
  ['POST cancel', 'POST', () => cancelRegistrationAdmin('demo', 'camp', 'registration-token', 'test-token')],
  ['POST approve', 'POST', () => reviewOrganization('demo', 'approve', 'test-token')],
  ['PATCH payment', 'PATCH', () => setPaymentStatusAdmin('demo', 'camp', 'registration-token', 'test-token', 'paid')],
  ['DELETE member', 'DELETE', () => removeOrganizationMemberAdmin('demo', 'member', 'test-token')],
] as const

it.each(mutations)('%s never retries a 503', async (_label, method, action) => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(unavailable('1')))
  vi.stubGlobal('fetch', fetch)
  const result = expect(action()).rejects.toThrow(de.states.serverRestarting)
  await vi.runAllTimersAsync()
  await result
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1].method).toBe(method)
})

it.each(mutations)('%s never retries a timeout', async (_label, _method, action) => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
  vi.stubGlobal('fetch', fetch)
  const result = expect(action()).rejects.toThrow(de.states.serverRestarting)
  await vi.runAllTimersAsync()
  await result
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('retries a timeout while reading the response body', async () => {
  vi.useFakeTimers()
  const body = new ReadableStream({ start(controller) { controller.error(Object.assign(new Error('body timeout'), { code: 'UND_ERR_BODY_TIMEOUT' })) } })
  const fetch = vi.fn().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  const result = read()
  await vi.advanceTimersByTimeAsync(1000)
  await expect(result).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
})


it('retries a body AbortError only when its signal timed out', async () => {
  vi.useFakeTimers()
  const timeout = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeout.signal)
  const body = new ReadableStream({
    pull(controller) {
      timeout.abort(new DOMException('timed out', 'TimeoutError'))
      controller.error(new DOMException('aborted', 'AbortError'))
    },
  })
  const fetch = vi.fn().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  const result = read()
  await vi.advanceTimersByTimeAsync(1000)
  await expect(result).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('does not retry an AbortError without a timeout', async () => {
  const fetch = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'))
  vi.stubGlobal('fetch', fetch)
  await expect(read()).rejects.toThrow(de.states.networkError)
  expect(fetch).toHaveBeenCalledTimes(1)
})
