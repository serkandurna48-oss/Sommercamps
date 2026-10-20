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
        expect(html).not.toMatch(/href="\/(pilot|platform)\//)
        if (['dashboard', 'camp', 'zahlungen', 'warteliste', 'aufgaben', 'konfiguration', 'camp-konfiguration'].includes(screen) && !(empty && screen.startsWith('camp'))) {
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
