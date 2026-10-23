import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('./adminSession', () => ({
  getAdminToken: vi.fn(),
  ADMIN_TOKEN_COOKIE: 'cp_admin_token',
  REFRESH_TOKEN_COOKIE: 'cp_admin_refresh',
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
}))

import { getValidAccessToken } from './supabaseServer'
import { getAdminToken, ADMIN_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './adminSession'
import { cookies } from 'next/headers'
import { platformLogoutAction } from '../platform/logoutAction'

function makeJwt(expOffsetSeconds: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCookieStore = any

let cookieStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetAllMocks()
  cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
  vi.mocked(cookies).mockResolvedValue(cookieStore as AnyCookieStore)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('kein Refresh-Aufruf bei gültigem Token', async () => {
  const validToken = makeJwt(3600)
  vi.mocked(getAdminToken).mockResolvedValue(validToken)
  vi.stubGlobal('fetch', vi.fn())

  const result = await getValidAccessToken()

  expect(result).toBe(validToken)
  expect(fetch).not.toHaveBeenCalled()
})

it('abgelaufenes Token + gültiges Refresh → neues Token und Cookies gesetzt', async () => {
  const expiredToken = makeJwt(-60)
  const newAccessToken = makeJwt(3600)
  const newRefreshToken = 'new-refresh-token'
  vi.mocked(getAdminToken).mockResolvedValue(expiredToken)
  cookieStore.get.mockImplementation((name: string) =>
    name === REFRESH_TOKEN_COOKIE ? { value: 'valid-refresh' } : { value: expiredToken },
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 3600,
    }),
  }))

  const result = await getValidAccessToken()

  expect(result).toBe(newAccessToken)
  expect(fetch).toHaveBeenCalledWith(
    'https://project.supabase.co/auth/v1/token?grant_type=refresh_token',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(cookieStore.set).toHaveBeenCalledWith(
    ADMIN_TOKEN_COOKIE,
    newAccessToken,
    expect.objectContaining({ maxAge: 3600 }),
  )
  expect(cookieStore.set).toHaveBeenCalledWith(
    REFRESH_TOKEN_COOKIE,
    newRefreshToken,
    expect.objectContaining({ maxAge: 30 * 24 * 60 * 60 }),
  )
})

it('Refresh schlägt fehl → Cookies gelöscht, null zurück (Aufrufer leitet zum Login)', async () => {
  const expiredToken = makeJwt(-60)
  vi.mocked(getAdminToken).mockResolvedValue(expiredToken)
  cookieStore.get.mockImplementation((name: string) =>
    name === REFRESH_TOKEN_COOKIE ? { value: 'expired-refresh' } : { value: expiredToken },
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

  const result = await getValidAccessToken()

  expect(result).toBeNull()
  expect(cookieStore.delete).toHaveBeenCalledWith({ name: ADMIN_TOKEN_COOKIE, path: '/' })
  expect(cookieStore.delete).toHaveBeenCalledWith({ name: REFRESH_TOKEN_COOKIE, path: '/' })
})

it('Logout löscht beide Cookies', async () => {
  cookieStore.get.mockImplementation((name: string) =>
    name === ADMIN_TOKEN_COOKIE ? { value: 'access-token' } : undefined,
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

  await expect(platformLogoutAction()).rejects.toThrow('redirect:/platform/login')

  expect(cookieStore.delete).toHaveBeenCalledWith({ name: ADMIN_TOKEN_COOKIE, path: '/' })
  expect(cookieStore.delete).toHaveBeenCalledWith({ name: REFRESH_TOKEN_COOKIE, path: '/' })
})
