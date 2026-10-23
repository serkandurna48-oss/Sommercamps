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
 * or 'refresh' when the proxy should attempt a token renewal.
 */
export function decideRefresh(opts: {
  access: string | undefined
  refresh: string | undefined
  now: number
  isPrefetch: boolean
}): 'skip' | 'refresh' {
  const { access, refresh, now, isPrefetch } = opts

  // No refresh cookie → nothing to renew.
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
