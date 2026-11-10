// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DemoDashboardPage, { metadata } from './page'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: (_action: unknown, initial: unknown) => [initial, () => {}, false] }
})
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  usePathname: () => '/demo/dashboard',
}))
vi.mock('next/link', () => ({
  default: ({ children, prefetch: _prefetch, ...props }: { children: ReactNode; href: string; prefetch?: boolean }) => <a {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../../../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn(() => { throw new Error('Unexpected authentication') }) }))

const fetchMock = vi.fn(() => { throw new Error('Unexpected network request') })
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const render = async (screen?: string[], query: Record<string, string> = {}) =>
  renderToStaticMarkup(await DemoDashboardPage({ params: Promise.resolve({ screen }), searchParams: Promise.resolve(query) }))

describe('/demo/dashboard', () => {
  it('ist nicht indexierbar', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('zeigt das echte Admin-Dashboard mit der Kennzeichnung „Demo – Beispieldaten“, ohne Netzwerk, in jeder Umgebung', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const html = await render()
    expect(html).toContain('Demo – Beispieldaten')
    expect(html).toContain('FC Beispielstadt')
    expect(html).not.toContain('JK Performance')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hält die Navigation im Demo-Bereich statt in /dev oder /pilot', async () => {
    const html = await render()
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    expect(hrefs.some(h => h.startsWith('/demo/dashboard/'))).toBe(true)
    expect(hrefs.filter(h => h.startsWith('/dev/') || h.startsWith('/pilot/'))).toEqual([])
    expect(hrefs).toContain('/campspilot/registrieren')
  })

  it('rendert weitere Bildschirme und den Leerzustand und liefert 404 für unbekannte', async () => {
    expect(await render(['camps'])).toContain('Demo – Beispieldaten')
    expect(await render(['zahlungen'], { leer: '1' })).toContain('Beispieldaten anzeigen')
    await expect(render(['gibt-es-nicht'])).rejects.toThrow('notFound')
    await expect(render(['camps', 'x'])).rejects.toThrow('notFound')
  })
})
