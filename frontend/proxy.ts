import { type NextRequest, NextResponse } from 'next/server'
import { decideRefresh } from './app/lib/sessionRefresh'

const ACCESS = 'cp_admin_token'
const REFRESH = 'cp_admin_refresh'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(request.url)

  // Path "/" — marketing redirect only; no token-refresh on root.
  if (pathname === '/') {
    if (process.env.NEXT_PUBLIC_SITE_MODE === 'campspilot-marketing') {
      return NextResponse.redirect(new URL('/campspilot', request.url))
    }
    return NextResponse.next()
  }

  // Paths /pilot/* and /platform/* — session token renewal.
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
  matcher: ['/', '/pilot/:path*', '/platform/:path*'],
}
