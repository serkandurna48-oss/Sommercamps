/**
 * Token-refresh middleware — Edge Runtime.
 * Runs before every request matched by config.matcher.
 *
 * Exported for unit-testing: parseJwtExp, decideRefresh.
 * The async middleware() function is the thin wrapper around them.
 */
import { type NextRequest, NextResponse } from 'next/server'

const ACCESS = 'cp_admin_token'
const REFRESH = 'cp_admin_refresh'

export function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    // Pad to a multiple of 4 so atob() (Edge Runtime / browsers) never throws.
    base64 += '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(base64)
    const payload = JSON.parse(json) as unknown
    if (!payload || typeof payload !== 'object') return null
    const exp = (payload as Record<string, unknown>).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

/**
 * Pure decision function — no I/O, no Next.js dependencies.
 * Returns 'skip' when the request must pass through unchanged,
 * or 'refresh' when the middleware should attempt a token renewal.
 */
export function decideRefresh(opts: {
  access: string | undefined
  refresh: string | undefined
  now: number
  isPrefetch: boolean
}): 'skip' | 'refresh' {
  const { access, refresh, now, isPrefetch } = opts

  // No refresh cookie → nothing to renew (parent pages under /pilot/:org without admin cookies).
  if (!refresh) return 'skip'

  // Prefetch requests must not trigger renewal — they race with the real request.
  if (isPrefetch) return 'skip'

  // Access cookie absent but refresh present: renew so Server Components see a fresh token.
  if (!access) return 'refresh'

  const exp = parseJwtExp(access)
  // Token still valid with a 5-minute safety buffer → no renewal needed.
  if (exp !== null && exp > now + 300) return 'skip'

  return 'refresh'
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS)?.value
  const refresh = request.cookies.get(REFRESH)?.value

  const isPrefetch =
    request.headers.get('Next-Router-Prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch'

  const now = Math.floor(Date.now() / 1000)

  if (decideRefresh({ access, refresh, now, isPrefetch }) === 'skip') {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return NextResponse.next()

  interface SessionData { access_token: string; refresh_token: string; expires_in: number }
  let session: SessionData | null = null
  let clearCookies = false

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (res.ok) {
      session = (await res.json()) as SessionData
    } else if (res.status === 400) {
      // Only clear cookies when Supabase explicitly says the token is invalid.
      // For 429/5xx the token may still be valid — leave cookies unchanged.
      let body: Record<string, unknown> | null = null
      try { body = (await res.json()) as Record<string, unknown> } catch { /* ignore */ }
      const errCode = String(body?.error ?? body?.error_code ?? '')
      if (errCode === 'invalid_grant' || errCode === 'refresh_token_not_found') {
        clearCookies = true
      }
    }
    // 429 / 5xx: clearCookies stays false, session stays null → fall through to pass-through below.
  } catch {
    // Network error — let request proceed; layout will redirect to login if token truly expired.
    return NextResponse.next()
  }

  if (clearCookies) {
    const response = NextResponse.next()
    response.cookies.delete(ACCESS)
    response.cookies.delete(REFRESH)
    return response
  }

  if (!session) {
    // 429 / 5xx / unknown 4xx — pass through without changing cookies.
    return NextResponse.next()
  }

  const isSecure = process.env.NODE_ENV === 'production'
  const cookieBase = { httpOnly: true, secure: isSecure, sameSite: 'lax' as const, path: '/' }

  // Forward new access token to Server Components via updated request cookie header.
  const requestHeaders = new Headers(request.headers)
  const existing = requestHeaders.get('cookie') ?? ''
  const parts = existing.split(/;\s*/).filter(c => c.length > 0 && !c.startsWith(`${ACCESS}=`))
  parts.push(`${ACCESS}=${session.access_token}`)
  requestHeaders.set('cookie', parts.join('; '))

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.cookies.set(ACCESS, session.access_token, { ...cookieBase, maxAge: session.expires_in })
  response.cookies.set(REFRESH, session.refresh_token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 })
  return response
}

export const config = {
  matcher: ['/pilot/:path*', '/platform/:path*'],
}
