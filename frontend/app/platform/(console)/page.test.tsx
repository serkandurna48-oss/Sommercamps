import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import PlatformPage from './page'
import { fetchCampsAdmin, fetchOrganizationsAdmin } from '../../lib/saasAdminApi'
import { reviewCamp, reviewOrg } from '../reviewFixtures'

vi.mock('../../lib/supabaseServer', () => ({ getValidAccessToken: async () => 'test-token' }))
vi.mock('../../lib/saasAdminApi', () => ({
  fetchOrganizationsAdmin: vi.fn(), fetchCampsAdmin: vi.fn(), fetchPlatformStats: async () => ({}),
}))
vi.mock('./StatsOverview', () => ({ default: () => null }))
vi.mock('./OrganizationList', () => ({ default: () => null }))

it('lädt Camps nur für eingereichte Vereine und übergibt sie der Client-Checkliste', async () => {
  vi.mocked(fetchOrganizationsAdmin).mockResolvedValue([
    reviewOrg, { ...reviewOrg, slug: 'fertig', review_status: 'approved' },
  ])
  vi.mocked(fetchCampsAdmin).mockResolvedValue([reviewCamp as Awaited<ReturnType<typeof fetchCampsAdmin>>[number]])
  const html = renderToStaticMarkup(await PlatformPage())
  expect(fetchCampsAdmin).toHaveBeenCalledExactlyOnceWith(reviewOrg.slug, 'test-token')
  expect(html).toContain('6/6 Prüfpunkte vollständig')
  expect(html).toContain('1 gesamt · 1 Entwurf · 0 veröffentlicht')
})
