import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(),
    redirect: vi.fn(),
  },
}))

import { NextResponse } from 'next/server'
import { config, proxy } from './proxy'
import { decideRefresh, parseJwtExp } from './app/lib/sessionRefresh'

function makeToken(expOffsetSeconds: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

function makeRequest(opts: {
  url?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
}) {
  const url = opts.url ?? 'http://localhost/pilot/dashboard'
  const headers = new Headers(opts.headers ?? {})
  if (opts.cookies) {
    headers.set('cookie', Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; '))
  }
  return {
    url,
    cookies: {
      get: (name: string) =>
        opts.cookies?.[name] != null ? { value: opts.cookies![name] } : undefined,
    },
    headers,
  } as unknown as import('next/server').NextRequest
}

const mockResponse = () => ({
  cookies: { set: vi.fn(), delete: vi.fn() },
  headers: new Headers(),
}) as unknown as NextResponse

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(NextResponse.next).mockImplementation(mockResponse)
  vi.mocked(NextResponse.redirect).mockImplementation(mockResponse)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// --- Token-Erneuerung (/pilot/* und /platform/*) ---

it('gültiges Token → kein fetch', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(3600), cp_admin_refresh: 'some-refresh' },
  })
  await proxy(request)
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
  await proxy(request)

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
  await proxy(request)
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
  await proxy(request)

  const response = vi.mocked(NextResponse.next).mock.results.at(-1)!.value
  expect(response.cookies.delete).toHaveBeenCalledWith('cp_admin_token')
  expect(response.cookies.delete).toHaveBeenCalledWith('cp_admin_refresh')
})

it('Supabase 429 → Cookies bleiben', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
  const request = makeRequest({
    cookies: { cp_admin_token: makeToken(-60), cp_admin_refresh: 'some-refresh' },
  })
  await proxy(request)

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
  await proxy(request)
  expect(fetch).not.toHaveBeenCalled()
})

it('Token ohne Padding wird korrekt gelesen', () => {
  // {"exp":10000000000} = 19 bytes (11-digit number) → 26 base64url chars → 26 % 4 = 2 → padding required
  const exp = 10_000_000_000
  const b64url = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  expect(b64url.length % 4).not.toBe(0) // confirm this payload actually needs padding
  expect(parseJwtExp(`header.${b64url}.sig`)).toBe(exp)
})

// Smoke-test: decideRefresh is the pure function wired into proxy
it('decideRefresh: kein Refresh ohne Refresh-Cookie', () => {
  expect(decideRefresh({ access: undefined, refresh: undefined, now: 0, isPrefetch: false }))
    .toBe('skip')
})

// --- Marketing-Redirect (nur Pfad "/") ---

it('Redirect bei "/" mit Marketing-Modus', async () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_MODE', 'campspilot-marketing')
  const request = makeRequest({ url: 'http://localhost/' })
  await proxy(request)
  expect(NextResponse.redirect).toHaveBeenCalledWith(
    expect.objectContaining({ href: 'http://localhost/campspilot' }),
  )
})

it('kein Redirect bei "/" ohne Marketing-Modus', async () => {
  const request = makeRequest({ url: 'http://localhost/' })
  await proxy(request)
  expect(NextResponse.redirect).not.toHaveBeenCalled()
  expect(NextResponse.next).toHaveBeenCalled()
})

it('kein Redirect bei "/pilot/x" trotz Marketing-Modus', async () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_MODE', 'campspilot-marketing')
  // No cookies → decideRefresh returns 'skip' → no fetch needed
  const request = makeRequest({ url: 'http://localhost/pilot/x' })
  await proxy(request)
  expect(NextResponse.redirect).not.toHaveBeenCalled()
})

it('frontend/middleware.ts existiert nicht mehr im Ordner frontend/', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  expect(existsSync(join(dir, 'middleware.ts'))).toBe(false)
})

// MUTATIONSPROBE: Wenn '/' aus config.matcher entfernt wird, schlägt dieser Test fehl,
// da Next.js den Proxy für "/" dann nie aufruft und der Redirect nie feuert.
it('MUTATIONSPROBE: config.matcher enthält "/" — ohne diesen Eintrag würde der Redirect-Test nie feuern', () => {
  expect((config.matcher as string[])).toContain('/')
})
