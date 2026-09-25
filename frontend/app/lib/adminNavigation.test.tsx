import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrgAdminLayout, { generateMetadata } from '../pilot/[org]/(org-admin)/layout'
import PlatformLayout from '../platform/(console)/layout'
import OrgSwitcher from '../components/saas/shell/OrgSwitcher'
import { getAdminToken } from './adminSession'
import { fetchMe, fetchOrganizationAdmin, type OrganizationAdmin } from './saasAdminApi'

vi.mock('./adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('./saasAdminApi', () => ({ fetchMe: vi.fn(), fetchOrganizationAdmin: vi.fn() }))
vi.mock('../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('../components/saas/GrainOverlay', () => ({ default: () => null }))
vi.mock('../platform/logoutAction', () => ({ platformLogoutAction: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) } }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminToken).mockResolvedValue('local-test-token')
  vi.mocked(fetchMe).mockResolvedValue({
    user_id: 'review-user', email: null, is_platform_owner: false, admin_organization_slugs: ['club-a'],
  })
})

const orgLayout = (slug: string) => OrgAdminLayout({
  params: Promise.resolve({ org: slug }),
  children: <OrgSwitcher name="Unpublished club" orgSlug={slug} logoUrl={null} />,
})

describe('admin navigation and role context', () => {
  it('allows own unpublished organization and hides the owner-only return link', async () => {
    const html = renderToStaticMarkup(await orgLayout('club-a'))
    expect(html).toContain('Unpublished club')
    expect(html).not.toContain('/platform/')
  })

  it('redirects a foreign organization URL to the assigned organization', async () => {
    await expect(orgLayout('club-b')).rejects.toThrow('redirect:/pilot/club-a/dashboard')
  })

  it('redirects the platform console for a club admin', async () => {
    await expect(PlatformLayout({ children: null })).rejects.toThrow('redirect:/pilot/club-a/dashboard')
  })

  it('lets the owner return from any organization to its platform detail', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user_id: 'owner', email: null, is_platform_owner: true, admin_organization_slugs: [] })
    const html = renderToStaticMarkup(await orgLayout('club-b'))
    expect(html).toContain('href="/platform/club-b"')
    await expect(PlatformLayout({ children: null })).resolves.toBeDefined()
  })

  it('redirects a missing or invalid session to login', async () => {
    vi.mocked(getAdminToken).mockResolvedValue(null)
    await expect(orgLayout('club-a')).rejects.toThrow('redirect:/pilot/club-a/login')
    vi.mocked(getAdminToken).mockResolvedValue('expired')
    vi.mocked(fetchMe).mockRejectedValue(new Error('401'))
    await expect(orgLayout('club-a')).rejects.toThrow('redirect:/pilot/club-a/login')
  })

  it('does not grant access to an account without organization memberships', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user_id: 'unassigned', email: null, is_platform_owner: false, admin_organization_slugs: [] })
    await expect(orgLayout('club-a')).rejects.toThrow('redirect:/pilot/club-a/login')
  })

  it('loads draft metadata through the authenticated admin endpoint', async () => {
    vi.mocked(fetchOrganizationAdmin).mockResolvedValue({ name: 'Draft club', site_published: false } as OrganizationAdmin)
    const metadata = await generateMetadata({ params: Promise.resolve({ org: 'draft-club' }) })
    expect(metadata.title).toBe('Draft club – Verwaltung')
    expect(fetchOrganizationAdmin).toHaveBeenCalledWith('draft-club', 'local-test-token')
  })
})
