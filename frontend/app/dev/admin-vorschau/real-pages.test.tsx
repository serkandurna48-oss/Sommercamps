import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import DashboardPage from '../../pilot/[org]/(org-admin)/dashboard/page'
import CampPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/page'
import CampCreatePage from '../../pilot/[org]/(org-admin)/camps/new/page'
import CampConfigPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/konfiguration/page'
import PaymentsPage from '../../pilot/[org]/(org-admin)/zahlungen/page'
import WaitlistPage from '../../pilot/[org]/(org-admin)/warteliste/page'
import TasksPage from '../../pilot/[org]/(org-admin)/aufgaben/page'
import ConfigPage from '../../pilot/[org]/(org-admin)/konfiguration/page'
import { getAdminToken } from '../../lib/adminSession'
import { getOrganizationAdmin, loadCampAdminData, loadOrgAdminData } from '../../components/saas/orgAdminData'
import { getPreviewFixtures } from './fixtures'

vi.mock('../../components/saas/orgAdminData', () => ({
  loadOrgAdminData: vi.fn(), loadCampAdminData: vi.fn(), getOrganizationAdmin: vi.fn(),
}))
vi.mock('../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
  usePathname: () => '/pilot/jk-performance-academy/dashboard',
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: <S,>(_action: unknown, initial: S) => [initial, () => {}, false] }
})

const fixtures = getPreviewFixtures()
const params = Promise.resolve({ org: fixtures.orgSlug, campSlug: fixtures.camps[0].slug })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAdminToken).mockResolvedValue('test-token')
  vi.mocked(getOrganizationAdmin).mockResolvedValue(fixtures.org)
  vi.mocked(loadOrgAdminData).mockResolvedValue({ ...fixtures, token: 'test-token' })
  vi.mocked(loadCampAdminData).mockResolvedValue({
    token: 'test-token', org: fixtures.org, camp: fixtures.camps[0], registrations: fixtures.registrationsByCamp[0],
  })
})

for (const [name, Page] of Object.entries({ DashboardPage, CampPage, CampCreatePage, CampConfigPage, PaymentsPage, WaitlistPage, TasksPage, ConfigPage })) {
  it(`${name} renders the shared screen with its authenticated data`, async () => {
    const html = renderToStaticMarkup(await (Page as (props: { params: typeof params; searchParams: Promise<{ created?: string }> }) => Promise<React.ReactElement>)({ params, searchParams: Promise.resolve({}) }))
    expect(html).toContain('JK Performance Academy')
    expect(html).toContain('aria-label="Bereiche"')
    expect(html).toContain('href="/pilot/jk-performance-academy/')
    expect(html).not.toContain('/dev/admin-vorschau')
    expect(html).not.toContain('Vorschau ·')
    if (Page === CampCreatePage || Page === ConfigPage) {
      expect(getOrganizationAdmin).toHaveBeenCalledWith(fixtures.orgSlug, 'test-token')
    } else if (Page === CampPage || Page === CampConfigPage) {
      expect(loadCampAdminData).toHaveBeenCalledWith(fixtures.orgSlug, fixtures.camps[0].slug)
    } else {
      expect(loadOrgAdminData).toHaveBeenCalledWith(fixtures.orgSlug)
    }
  }, 30_000)
}

for (const Page of [CampCreatePage, ConfigPage]) {
  it(`${Page.name} still requires authentication`, async () => {
    vi.mocked(getAdminToken).mockResolvedValue(null)
    await expect(Page({ params })).rejects.toThrow(`redirect:/pilot/${fixtures.orgSlug}/login`)
    expect(getOrganizationAdmin).not.toHaveBeenCalled()
  })
  it(`${Page.name} still rejects unknown organizations`, async () => {
    vi.mocked(getOrganizationAdmin).mockResolvedValue(null)
    await expect(Page({ params })).rejects.toThrow('notFound')
  })
}
