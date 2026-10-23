/**
 * Server-side Supabase Auth client (feat/platform-foundation) — used only
 * by the two login server actions (platform/login/actions.ts,
 * pilot/[org]/login/actions.ts) to exchange email+password for a session,
 * then we store just the access_token ourselves (see lib/adminSession.ts's
 * existing httpOnly cookie) rather than keeping a live Supabase client
 * session server-side. `persistSession`/`autoRefreshToken` are both off:
 * a Next.js server action is a one-shot request handler, not a long-lived
 * process that could use Supabase's own session-refresh machinery — our
 * own cookie's maxAge (session.expires_in) is the only expiry that matters
 * here, and app/auth_deps.py on the backend re-verifies the token against
 * Supabase on every request anyway (see backend_saas/app/supabase_auth.py).
 *
 * NEXT_PUBLIC_* naming (not a private-only var) is intentional even though
 * this file only runs server-side today: the anon key is safe to expose to
 * a browser by design (Supabase's own model — it's paired with RLS, not a
 * secret), and using the same public var name here as a future
 * client-side Supabase usage would need avoids a second, differently-named
 * env var for the identical value.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getAdminToken } from './adminSession'

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not configured — see frontend/.env.local.example',
    )
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as unknown
    if (!payload || typeof payload !== 'object') return null
    const exp = (payload as Record<string, unknown>).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

interface RefreshedSession {
  access_token: string
  refresh_token: string
  expires_in: number
}

async function callRefreshEndpoint(refreshToken: string): Promise<RefreshedSession | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    return (await res.json()) as RefreshedSession
  } catch {
    return null
  }
}

/**
 * Returns a valid access token, refreshing via the Supabase refresh endpoint if the
 * access token is expired or expires within 5 minutes. Returns null when no token
 * exists, when no refresh token is stored, or when the refresh call fails — in all
 * failure cases both cookies are deleted. Callers redirect to login on null, the same
 * way they currently handle a missing getAdminToken() result.
 *
 * Cookie writes are skipped silently in Server Component render context (Next.js
 * forbids them there); the Middleware (middleware.ts) performs the same refresh
 * before the render, so cookies arriving at a Server Component are already fresh.
 * In Server Actions and Route Handlers cookie writes succeed normally.
 *
 * React cache() deduplicates within a single Server Component render pass so at most
 * one refresh call is made per request. Outside a React render (tests, Route Handlers)
 * cache() is a transparent passthrough.
 */
export const getValidAccessToken = cache(async (): Promise<string | null> => {
  const accessToken = await getAdminToken()
  if (!accessToken) return null

  const exp = parseJwtExp(accessToken)
  if (exp === null) return accessToken // non-JWT token (e.g. test fixtures) — pass through

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (exp > nowSeconds + 300) return accessToken // still valid with 5-minute margin

  const store = await cookies()
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value
  if (!refreshToken) {
    try { store.delete({ name: ADMIN_TOKEN_COOKIE, path: '/' }) } catch { /* Server Component render */ }
    return null
  }

  const session = await callRefreshEndpoint(refreshToken)
  if (!session) {
    try {
      store.delete({ name: ADMIN_TOKEN_COOKIE, path: '/' })
      store.delete({ name: REFRESH_TOKEN_COOKIE, path: '/' })
    } catch { /* Server Component render */ }
    return null
  }

  const isSecure = process.env.NODE_ENV === 'production'
  const base = { httpOnly: true, secure: isSecure, sameSite: 'lax' as const, path: '/' }
  try {
    store.set(ADMIN_TOKEN_COOKIE, session.access_token, { ...base, maxAge: session.expires_in })
    store.set(REFRESH_TOKEN_COOKIE, session.refresh_token, { ...base, maxAge: 30 * 24 * 60 * 60 })
  } catch { /* Server Component render */ }
  return session.access_token
})
