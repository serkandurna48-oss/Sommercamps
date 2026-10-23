/**
 * Token-refresh Middleware — runs before every request to protected routes.
 * If the access token is absent, expired, or expires within 5 minutes it calls the
 * Supabase refresh endpoint and updates both cookies (access + refresh) so Server
 * Components on the same request already see the fresh token. On refresh failure
 * both cookies are cleared; the auth-gate layouts then redirect to login.
 *
 * Uses the Edge Runtime (no Node.js Buffer — atob for base64url decoding).
 */
import { type NextRequest, NextResponse } from 'next/server'

const ACCESS = 'cp_admin_token'
const REFRESH = 'cp_admin_refresh'

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    const payload = JSON.parse(json) as unknown
    if (!payload || typeof payload !== 'object') return null
    const exp = (payload as Record<string, unknown>).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS)?.value
  const refresh = request.cookies.get(REFRESH)?.value

  if (!access || !refresh) return NextResponse.next()

  const exp = parseJwtExp(access)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (exp !== null && exp > nowSeconds + 300) return NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return NextResponse.next()

  interface SessionData { access_token: string; refresh_token: string; expires_in: number }
  let session: SessionData | null = null
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (res.ok) {
      session = (await res.json()) as SessionData
    }
  } catch {
    // network error — let request proceed; layout will redirect to login if token is truly expired
    return NextResponse.next()
  }

  if (!session) {
    const response = NextResponse.next()
    response.cookies.delete(ACCESS)
    response.cookies.delete(REFRESH)
    return response
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
