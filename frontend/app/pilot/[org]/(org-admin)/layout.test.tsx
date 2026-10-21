import { expect, it, vi, beforeEach } from 'vitest'
import OrgAdminLayout from './layout'
import { getAdminToken } from '../../../lib/adminSession'
import { AdminAuthError, fetchMe } from '../../../lib/saasAdminApi'
import { getOrganizationAdmin } from '../../../components/saas/orgAdminData'

vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', async () => ({ ...await vi.importActual('../../../lib/saasAdminApi'), fetchMe: vi.fn() }))
vi.mock('../../../components/saas/orgAdminData', () => ({ getOrganizationAdmin: vi.fn() }))
vi.mock('../../../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) } }))

beforeEach(() => {
  vi.mocked(getAdminToken).mockResolvedValue('test')
  vi.mocked(fetchMe).mockResolvedValue({ is_platform_owner: false, admin_organization_slugs: ['demo'] } as Awaited<ReturnType<typeof fetchMe>>)
})

it('keeps the child error boundary mounted when club identity fails to load', async () => {
  vi.mocked(getOrganizationAdmin).mockRejectedValue(new Error('API unavailable'))
  const layout = await OrgAdminLayout({ children: 'route-boundary', params: Promise.resolve({ org: 'demo' }) })
  expect(layout.props.children).toBe('route-boundary')
  expect(layout.props.org).toBeUndefined()
})

it('still redirects an expired club authorization to login', async () => {
  vi.mocked(getOrganizationAdmin).mockRejectedValue(new AdminAuthError())
  await expect(OrgAdminLayout({ children: 'private', params: Promise.resolve({ org: 'demo' }) })).rejects.toThrow('redirect:/pilot/demo/login')
})
