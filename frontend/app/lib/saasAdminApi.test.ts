/**
 * Tests für PF1b: fetchMe-Deduplizierung (cache) und 503-Retry.
 *
 * React's cache() ist außerhalb eines Server-Request-Kontexts eine no-op;
 * der Mock ersetzt es durch eine einfache Map-basierte Memoiserung, die im
 * Test dieselbe Deduplizierungs-Semantik erzeugt.
 */

import { afterEach, expect, it, vi } from 'vitest'
import type { Me } from './saasAdminApi'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => {
      const memo = new Map<string, unknown>()
      return ((...args: unknown[]) => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) memo.set(key, fn(...args))
        return memo.get(key)
      }) as T
    },
  }
})

const { fetchMe } = await import('./saasAdminApi')

const okMe: Me = {
  user_id: 'u1',
  email: 'a@b.com',
  is_platform_owner: true,
  admin_organization_slugs: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('fetchMe dedupliziert innerhalb einer Anfrage: zweimal aufgerufen → ein fetch', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(okMe), { status: 200 })))

  await fetchMe('dedup-token')
  await fetchMe('dedup-token')

  expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1)
})

it('bei 503 dann 200 → Erfolg mit genau 2 fetch-Aufrufen', async () => {
  let calls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls++
      if (calls === 1) return new Response('', { status: 503, headers: { 'Retry-After': '2' } })
      return new Response(JSON.stringify(okMe), { status: 200 })
    }),
  )

  vi.useFakeTimers()
  const promise = fetchMe('retry-token')
  await vi.advanceTimersByTimeAsync(1999)
  expect(calls).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  const result = await promise

  expect(calls).toBe(2)
  expect(result.user_id).toBe('u1')
})
