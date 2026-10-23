import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(),
  },
}))

import { NextResponse } from 'next/server'
import { decideRefresh, middleware, parseJwtExp } from './middleware'

function makeToken(expOffsetSeconds: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

function makeRequest(opts: {
  cookies?: Record<string, string>
  headers?: Record<string, string>
}) {
  const headers = new Headers(opts.headers ?? {})
  if (opts.cookies) {
    headers.set('cookie', Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; '))
  }
  return {
    cookies: {
      get: (name: string) =>
        opts.cookies?.[name] != null ? { value: opts.cookies![name] } : undefined,
    },
    headers,
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(NextResponse.next).mockImplementation(() => ({
    cookies: { set: vi.fn(), delete: vi.fn() },
    headers: new Headers(),
  }) as unknown as NextResponse)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('gültiges Token → kein fetch', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(3600), cp_admin_refresh: 'some-refresh' },
  })
  await middleware(request)
  expect(fetch).not.toHaveBeenCalled()
})

it('Access fehlt + Refresh da → fetch + beide Cookies gesetzt', async () => {
  const newAccessToken = makeToken(3600)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      access_token: newAccessToken,
      refresh_token: 'new-refresh',
      expires_in: 3600,
    }),
  }))
  const request = makeRequest({ cookies: { cp_admin_refresh: 'old-refresh' } })
  await middleware(request)

  expect(fetch).toHaveBeenCalledWith(
    'https://project.supabase.co/auth/v1/token?grant_type=refresh_token',
    expect.objectContaining({ method: 'POST' }),
  )
  const response = vi.mocked(NextResponse.next).mock.results.at(-1)!.value
  expect(response.cookies.set).toHaveBeenCalledWith(
    'cp_admin_token',
    newAccessToken,
    expect.objectContaining({ maxAge: 3600, httpOnly: true, sameSite: 'lax', path: '/' }),
  )
  expect(response.cookies.set).toHaveBeenCalledWith(
    'cp_admin_refresh',
    'new-refresh',
    expect.objectContaining({ maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', path: '/' }),
  )
})

it('abgelaufenes Token → fetch', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(-60), cp_admin_refresh: 'some-refresh' },
  })
  await middleware(request)
  expect(fetch).toHaveBeenCalled()
})

it('Supabase 400 invalid_grant → Cookies gelöscht', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: vi.fn().mockResolvedValue({ error: 'invalid_grant' }),
  }))
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(-60), cp_admin_refresh: 'expired-refresh' },
  })
  await middleware(request)

  const response = vi.mocked(NextResponse.next).mock.results.at(-1)!.value
  expect(response.cookies.delete).toHaveBeenCalledWith('cp_admin_token')
  expect(response.cookies.delete).toHaveBeenCalledWith('cp_admin_refresh')
})

it('Supabase 429 → Cookies bleiben', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(-60), cp_admin_refresh: 'some-refresh' },
  })
  await middleware(request)

  const response = vi.mocked(NextResponse.next).mock.results.at(-1)!.value
  expect(response.cookies.delete).not.toHaveBeenCalled()
  expect(response.cookies.set).not.toHaveBeenCalled()
})

it('Prefetch → kein fetch', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(-60), cp_admin_refresh: 'some-refresh' },
    headers: { 'Next-Router-Prefetch': '1' },
  })
  await middleware(request)
  expect(fetch).not.toHaveBeenCalled()
})

it('Token ohne Padding wird korrekt gelesen', () => {
  // {"exp":10000000000} = 19 bytes (11-digit number) → 26 base64url chars → 26 % 4 = 2 → padding required
  const exp = 10_000_000_000
  const b64url = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  expect(b64url.length % 4).not.toBe(0) // confirm this payload actually needs padding
  expect(parseJwtExp(`header.${b64url}.sig`)).toBe(exp)
})

// Smoke-test: decideRefresh is the pure function wired into middleware
it('decideRefresh: kein Refresh ohne Refresh-Cookie', () => {
  expect(decideRefresh({ access: undefined, refresh: undefined, now: 0, isPrefetch: false }))
    .toBe('skip')
})
