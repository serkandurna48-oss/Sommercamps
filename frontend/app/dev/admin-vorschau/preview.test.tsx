// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PreviewPage from './[screen]/page'
import PreviewIndex from './page'
import { getPreviewFixtures, registrations, organization } from './fixtures'
import { previewScreens } from './screens'
import { buildTasks, computeCampStats } from '../../components/saas/dashboardLogic'
import { previewHref, previewLogoutAction } from '../../components/saas/preview/AdminPreviewContext'
import { getAdminToken } from '../../lib/adminSession'

type State = { error: string | null; saved?: boolean; success?: string | null }
const hooks = vi.hoisted(() => ({
  pathname: '/dev/admin-vorschau/dashboard',
  actions: [] as { action: (state: State, data: FormData) => Promise<State>; initial: State }[],
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: (action: (state: State, data: FormData) => Promise<State>, initial: State) => {
    hooks.actions.push({ action, initial })
    return [initial, () => {}, false]
  } }
})
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  usePathname: () => hooks.pathname,
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('../../lib/adminSession', () => ({ getAdminToken: vi.fn(() => { throw new Error('Unexpected authentication') }) }))

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  hooks.actions.length = 0
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const page = (screen: string, empty = false) => PreviewPage({
  params: Promise.resolve({ screen }), searchParams: Promise.resolve(empty ? { leer: '1' } : {}),
})

describe('development-only admin preview', () => {
  for (const env of ['test', 'production'] as const) {
    it(`returns notFound in ${env}, before resolving params or accessing data`, async () => {
      vi.stubEnv('NODE_ENV', env)
      expect(() => PreviewIndex()).toThrow('notFound')
      for (const [screen] of previewScreens) await expect(page(screen)).rejects.toThrow('notFound')
      expect(getAdminToken).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })
  }

  it('rejects unknown screens', async () => {
    await expect(page('unknown')).rejects.toThrow('notFound')
  })

  it('links every screen and every empty state from the index', () => {
    const html = renderToStaticMarkup(<PreviewIndex />)
    for (const [screen] of previewScreens) {
      expect(html).toContain(`href="/dev/admin-vorschau/${screen}"`)
      expect(html).toContain(`href="/dev/admin-vorschau/${screen}?leer=1"`)
    }
  })

  for (const [screen] of previewScreens) {
    for (const empty of [false, true]) {
      it(`renders ${screen}${empty ? ' (empty)' : ''} with the real shell and without I/O`, async () => {
        hooks.pathname = `/dev/admin-vorschau/${screen}`
        const html = renderToStaticMarkup(await page(screen, empty))
        expect(html).toContain('JK Performance Academy')
        expect(html).toContain('aria-label="Bereiche"')
        expect(html).toContain('/jk/logo.jpg')
        expect(html).toContain('cp-scope')
        const document = window.document.implementation.createHTMLDocument()
        document.body.innerHTML = html
        const header = document.querySelector('header')!
        const campLevel = screen.startsWith('camp') && screen !== 'camp-neu' && !empty
        expect([...header.querySelectorAll('nav a')].map(a => a.textContent)).toEqual([
          campLevel ? 'Teilnehmer' : 'Übersicht', 'Zahlungen', 'Warteliste', 'Aufgaben', 'Einstellungen',
        ])
        const back = [...header.querySelectorAll('a')].find(a => a.textContent?.trim() === '← Zurück')
        if (screen === 'dashboard') expect(back).toBeUndefined()
        else {
          const target = campLevel && screen !== 'camp' ? '/dev/admin-vorschau/camp' : '/dev/admin-vorschau/dashboard'
          const query = empty ? '?leer=1' : campLevel && screen !== 'camp' ? `?camp=${getPreviewFixtures().camps[0].slug}` : ''
          expect(back?.getAttribute('href')).toBe(`${target}${query}`)
        }
        expect(header.querySelectorAll('h1')).toHaveLength(1)
        expect(header.querySelectorAll('.cp-num').length).toBeLessThanOrEqual(3)
        expect(header.className).toContain('md:sticky')
        expect(header.className.split(' ')).not.toContain('sticky')
        if (screen === 'konfiguration') expect(header.querySelector('h1')?.textContent).toBe('Vereinseinstellungen')
        if (screen === 'camp-konfiguration' && !empty) expect(header.querySelector('h1')?.textContent).toBe('Camp-Einstellungen')
        for (const button of document.querySelectorAll('button')) expect(button.className).toMatch(/cp-btn-(primary|secondary|danger)\b/)
        for (const card of document.querySelectorAll('.cp-card:not(.cp-card-list), [class*="rounded-[var(--cp-r-card)]"]')) {
          expect(card.querySelectorAll('.cp-btn-primary').length).toBeLessThanOrEqual(1)
        }
        if (screen === 'dashboard') {
          for (const link of document.querySelectorAll('main a')) {
            if (link.textContent?.trim() === 'Ansehen') expect(link.className).toContain('cp-btn-primary')
          }
        }
        // Hilfe intentionally contains 'Sie'/'Ihnen' in parent-facing copy templates and FAQ
        expect(document.body.textContent).not.toMatch(/—|\.\.\./)
        if (screen !== 'hilfe') {
          expect(document.body.textContent).not.toMatch(/\bSie\b|\bIhnen\b/)
        }
        expect(html).not.toMatch(/href="\/(pilot|platform)\//)
        if (['dashboard', 'camp', 'zahlungen', 'warteliste', 'aufgaben', 'konfiguration', 'camp-konfiguration', 'camp-zahlungen', 'camp-warteliste', 'camp-aufgaben'].includes(screen) && !(empty && screen.startsWith('camp'))) {
          expect(html).toContain('aria-current="page"')
        }
        if (empty) expect(html).not.toContain('familie1@campspilot.example')
        expect(getAdminToken).not.toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
      }, 30_000)
    }

    it(`${screen}: every rendered action is a local no-op`, async () => {
      renderToStaticMarkup(await page(screen))
      for (const { action, initial } of hooks.actions) {
        const result = await action(initial, new FormData())
        expect(result.error).toContain('Vorschau')
        expect(result.saved).not.toBe(true)
        expect(result.success).not.toBeTruthy()
      }
      expect(getAdminToken).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    }, 30_000)
  }

  it('keeps logout local and preserves empty-state navigation', async () => {
    await previewLogoutAction()
    expect(getAdminToken).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(previewHref('/pilot/demo/camps/new', true)).toBe('/dev/admin-vorschau/camp-neu?leer=1')
    expect(previewHref('/pilot/demo/camps/autumn/konfiguration', true)).toBe('/dev/admin-vorschau/camp-konfiguration?leer=1')
  })
})

it('provides coherent, invented fixtures and real derived tasks', () => {
  const data = getPreviewFixtures()
  expect(organization).toMatchObject({ theme: 'akademie', primary_color: '#B8912B', logo_url: '/jk/logo.jpg' })
  expect(data.camps).toHaveLength(3)
  expect(registrations).toHaveLength(28)
  expect(data.registrationsByCamp.flat()).toHaveLength(28)
  expect(new Set(data.registrationsByCamp.flat().map(r => r.id)).size).toBe(28)
  expect(registrations.filter(r => r.status === 'waitlist')).toHaveLength(4)
  expect(registrations.every(r => r.parent_email.endsWith('@campspilot.example'))).toBe(true)
  expect(new Set(registrations.map(r => r.status)).size).toBe(4)
  expect(new Set(registrations.map(r => r.payment_status)).size).toBe(5)
  const stats = data.camps.map((camp, i) => computeCampStats(camp, data.registrationsByCamp[i]))
  expect(stats[0].registeredCount).toBe(data.camps[0].capacity)
  expect(stats[1].registeredCount).toBe(data.camps[1].capacity / 2)
  expect(data.camps[2].status).toBe('draft')
  expect(buildTasks(stats).length).toBeGreaterThan(0)
  expect(getPreviewFixtures(true)).toMatchObject({ camps: [], registrationsByCamp: [], org: { camp_count: 0 } })
})

it('shows daily arrivals, the full daily list and the onboarding card in empty state', async () => {
  const dashboard = renderToStaticMarkup(await page('dashboard'))
  expect(dashboard).toContain('Heute neu: 0 Anmeldungen')
  expect(dashboard).toContain('href="/dev/admin-vorschau/anmeldungen"')
  const daily = renderToStaticMarkup(await page('anmeldungen'))
  expect(daily).toContain('Heute noch keine neuen Anmeldungen')
  expect(daily).not.toMatch(/href="\/(pilot|platform)\//)
  // leer=1 zeigt Schritt 1 (leerer Verein, keine Pflichtangaben, kein Camp)
  const empty = renderToStaticMarkup(await page('dashboard', true))
  expect(empty).toContain('In 3 Schritten zur Anmeldeseite')
  expect(empty).toContain('Vereinsangaben vervollständigen')
  expect(empty).not.toContain('Alles erledigt')
  expect(empty).toContain('href="/dev/admin-vorschau/konfiguration?leer=1"')
})

it('shows onboarding card steps 2 and 3 for the dashboard preview variants', async () => {
  const step2 = renderToStaticMarkup(await PreviewPage({
    params: Promise.resolve({ screen: 'dashboard' }),
    searchParams: Promise.resolve({ schritt: '2' }),
  }))
  expect(step2).toContain('In 3 Schritten zur Anmeldeseite')
  expect(step2).toContain('Erstes Camp anlegen')
  expect(step2).toContain('href="/dev/admin-vorschau/camp-neu"')
  expect(step2).not.toMatch(/href="\/(pilot|platform)\//)

  const step3 = renderToStaticMarkup(await PreviewPage({
    params: Promise.resolve({ screen: 'dashboard' }),
    searchParams: Promise.resolve({ schritt: '3' }),
  }))
  expect(step3).toContain('In 3 Schritten zur Anmeldeseite')
  expect(step3).toContain('Seite und Camp veröffentlichen')
  expect(step3).toContain('href="/dev/admin-vorschau/camp-konfiguration?camp=technikcamp"')
  expect(step3).not.toMatch(/href="\/(pilot|platform)\//)
})

it('preserves task filters and camp selection inside the preview', async () => {
  const href = previewHref('/pilot/demo/camps/technikcamp?filter=missing-info&sort=name', false)
  expect(href).toBe('/dev/admin-vorschau/camp?filter=missing-info&sort=name&camp=technikcamp')
  const filtered = renderToStaticMarkup(await PreviewPage({
    params: Promise.resolve({ screen: 'camp' }),
    searchParams: Promise.resolve({ filter: 'missing-info', sort: 'name', camp: 'technikcamp' }),
  }))
  const data = getPreviewFixtures()
  const expected = computeCampStats(data.camps[0], data.registrationsByCamp[0]).missingEmergencyContactCount
  expect(filtered.match(/class="cp-roster-row/g)).toHaveLength(expected)
  expect(filtered).toContain('value="name" selected=""')
  expect(filtered).not.toMatch(/href="\/(pilot|platform)\//)
  expect(previewHref('/pilot/demo/camps/technikcamp/zahlungen?filter=open', false))
    .toBe('/dev/admin-vorschau/camp-zahlungen?filter=open&camp=technikcamp')
  const winter = renderToStaticMarkup(await PreviewPage({
    params: Promise.resolve({ screen: 'camp' }),
    searchParams: Promise.resolve({ camp: 'wintercamp', sort: 'newest' }),
  }))
  expect(winter).toContain('<h1 class="cp-band-title break-words">Wintercamp Ballgefühl</h1>')
  expect(winter).toContain('Eingang:')
  expect(winter).not.toMatch(/href="\/(pilot|platform)\//)
})
