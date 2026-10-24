import { readdirSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('./components/marketing/SiteMotion', () => ({ default: () => null }))
vi.mock('./components/marketing/BootCurtain', () => ({ default: () => null }))

import { headers } from 'next/headers'
import { generateMetadata as mainMetadata } from './(marketing)/campspilot/page'
import { generateMetadata as impressumMetadata } from './(marketing)/campspilot/impressum/page'
import { generateMetadata as datenschutzMetadata } from './(marketing)/campspilot/datenschutz/page'
import { generateMetadata as termsMetadata } from './(marketing)/campspilot/teilnahmebedingungen/page'
import { generateMetadata as registerMetadata } from './(marketing)/campspilot/registrieren/page'
import sitemap from './sitemap'
import robots from './robots'

const pages = [
  ['/campspilot', mainMetadata, true],
  ['/campspilot/impressum', impressumMetadata, false],
  ['/campspilot/datenschutz', datenschutzMetadata, false],
  ['/campspilot/teilnahmebedingungen', termsMetadata, false],
  ['/campspilot/registrieren', registerMetadata, false],
] as const

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example')
  vi.mocked(headers).mockReset().mockResolvedValue(new Headers({ host: 'localhost:3000' }) as Awaited<ReturnType<typeof headers>>)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Marketing-SEO', () => {
  it.each(pages)('%s hat kurze Metadaten, eigene Canonical-URL und passende Indexierung', async (path, generate, index) => {
    const metadata = await generate()
    expect(typeof metadata.title).toBe('string')
    expect((metadata.title as string).length).toBeGreaterThan(0)
    expect((metadata.title as string).length).toBeLessThanOrEqual(60)
    expect(metadata.description!.length).toBeGreaterThan(0)
    expect(metadata.description!.length).toBeLessThanOrEqual(155)
    expect(metadata.alternates?.canonical).toBe(`https://camps.example${path}`)
    expect(metadata.robots).toEqual({ index, follow: true })
    expect(metadata.openGraph).toMatchObject({
      title: metadata.title, description: metadata.description,
      url: `https://camps.example${path}`, locale: 'de_DE', siteName: 'CampsPilot', type: 'website',
    })
    expect(headers).not.toHaveBeenCalled()
  })

  it('nennt die gesuchte Online-Anmeldung und die Zielgruppe', async () => {
    const metadata = await mainMetadata()
    expect(metadata.title).toContain('Anmeldung Fußballcamp online')
    expect(metadata.description).toContain('Vereinen und Fußballschulen')
  })

  it.each([impressumMetadata, datenschutzMetadata, termsMetadata])('gibt die Rechtsinhalte als noch nicht freigegeben wieder', async generate => {
    expect((await generate()).description).toContain('noch nicht freigegeben')
  })
})

describe('Sitemap und Robots', () => {
  it('enthält nur die Marketing-URL, solange kein öffentlicher Vereinslisten-Endpunkt existiert', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await sitemap()).toEqual([{ url: 'https://camps.example/campspilot' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('erlaubt öffentliche Seiten und sperrt alle tatsächlichen Admin-Pfade', async () => {
    const result = await robots()
    expect(result.sitemap).toBe('https://camps.example/sitemap.xml')
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: [
      '/platform', '/pilot/*/anmeldungen', '/pilot/*/aufgaben', '/pilot/*/camps',
      '/pilot/*/dashboard', '/pilot/*/einrichtung', '/pilot/*/export', '/pilot/*/hilfe',
      '/pilot/*/konfiguration', '/pilot/*/warteliste', '/pilot/*/zahlungen',
      '/pilot/*/login', '/dev', '/api',
    ] })
    const rules = result.rules as { disallow: string[] }
    const adminRoutes = readdirSync('app/pilot/[org]/(org-admin)', { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => `/pilot/*/${entry.name}`)
    expect(rules.disallow).toEqual(expect.arrayContaining(adminRoutes))
    expect(rules.disallow).not.toContain('/pilot')
    expect(rules.disallow).not.toContain('/campspilot')
  })

  it.each([
    [{ host: 'localhost:3000' }, 'http://localhost:3000'],
    [{ host: 'verein.example' }, 'https://verein.example'],
    [{ host: 'internal:3000', 'x-forwarded-host': 'public.example, proxy.example', 'x-forwarded-proto': 'https, http' }, 'https://public.example'],
  ])('verwendet den CX1-Host-Fallback durchgängig (%j)', async (requestHeaders, origin) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.mocked(headers).mockResolvedValue(new Headers(requestHeaders as Record<string, string>) as Awaited<ReturnType<typeof headers>>)
    expect(await sitemap()).toEqual([{ url: `${origin}/campspilot` }])
    expect((await robots()).sitemap).toBe(`${origin}/sitemap.xml`)
    for (const [path, generate] of pages) {
      expect((await generate()).alternates?.canonical).toBe(`${origin}${path}`)
    }
  })
})
