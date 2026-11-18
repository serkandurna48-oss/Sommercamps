// Finding 6 (18.11.2026): only HSTS was set on production.
import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from './securityHeaders'

const byKey = Object.fromEntries(SECURITY_HEADERS.map((header) => [header.key, header.value]))

describe('security headers', () => {
  it('forbids framing, sniffing and leaking the path as referrer', () => {
    expect(byKey['X-Frame-Options']).toBe('DENY')
    expect(byKey['X-Content-Type-Options']).toBe('nosniff')
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(byKey['Permissions-Policy']).toContain('camera=()')
  })

  it('has a CSP that blocks framing, plugins, <base> and foreign form targets', () => {
    expect(CONTENT_SECURITY_POLICY).toBe("frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
    expect(byKey['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY)
  })

  it('does not block the clipboard, which the copy buttons need', () => {
    expect(byKey['Permissions-Policy']).not.toContain('clipboard')
  })

  it('is applied to every path by next.config', async () => {
    const config = typeof nextConfig === 'function' ? null : nextConfig
    const rules = await config!.headers!()
    expect(rules).toEqual([{ source: '/:path*', headers: [...SECURITY_HEADERS] }])
  })
})
