import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NewCampPage from './page'
import CampConfigPage from '../[campSlug]/konfiguration/page'
import CampDetailScreen from '../../../../../components/saas/screens/CampDetailScreen'
import { getValidAccessToken } from '../../../../../lib/supabaseServer'
import { fetchCampsAdmin } from '../../../../../lib/saasAdminApi'
import { getOrganizationAdmin, loadCampAdminData } from '../../../../../components/saas/orgAdminData'
import { getPreviewFixtures } from '../../../../../dev/admin-vorschau/fixtures'
import { DUPLICATE_MISSING, DUPLICATE_SUCCESS } from '../../../../../components/saas/config/campDuplicate'

vi.mock('../../../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../../../components/saas/orgAdminData', () => ({ getOrganizationAdmin: vi.fn(), loadCampAdminData: vi.fn() }))
vi.mock('../../../../../lib/saasAdminApi', async original => ({ ...await original<typeof import('../../../../../lib/saasAdminApi')>(), fetchCampsAdmin: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
  notFound: () => { throw new Error('notFound') },
  usePathname: () => '/pilot/demo/camps/new',
}))

const fixtures = getPreviewFixtures()
const source = fixtures.camps[0]
const params = Promise.resolve({ org: fixtures.orgSlug, campSlug: source.slug })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(getOrganizationAdmin).mockResolvedValue(fixtures.org)
  vi.mocked(fetchCampsAdmin).mockResolvedValue(fixtures.camps)
  vi.mocked(loadCampAdminData).mockResolvedValue({ token: 'token', org: fixtures.org, camp: source, registrations: [] })
})

it('lädt von nur innerhalb des angemeldeten Vereins und verwendet das vorhandene Formular', async () => {
  const page = await NewCampPage({ params, searchParams: Promise.resolve({ von: source.slug }) })
  expect(fetchCampsAdmin).toHaveBeenCalledWith(fixtures.orgSlug, 'token')
  expect(page.props.initialValues).toMatchObject({ title: `${source.title} (Kopie)`, start_date: '', end_date: '', status: 'draft' })
  const html = renderToStaticMarkup(page)
  expect(html).toContain('Camp duplizieren')
  expect(html).toContain('name="duplicate"')
  expect(html).not.toMatch(/\b(du|dein\w*|dir|dich|prüfe|ergänze|wähle)\b/i)
})

it('zeigt bei unbekanntem Quell-Slug ein leeres Formular mit kurzem Hinweis', async () => {
  const page = await NewCampPage({ params, searchParams: Promise.resolve({ von: 'unbekannt' }) })
  expect(page.props.initialValues).toBeUndefined()
  const html = renderToStaticMarkup(page)
  expect(html).toContain(DUPLICATE_MISSING)
  expect(html).toMatch(/<input[^>]*name="title"[^>]*value=""/)
  expect(html).not.toContain('name="duplicate"')
})

it('lädt ohne von keine Quelle und zeigt keinen Warnhinweis', async () => {
  const page = await NewCampPage({ params })
  expect(fetchCampsAdmin).not.toHaveBeenCalled()
  expect(renderToStaticMarkup(page)).not.toContain(DUPLICATE_MISSING)
})

it('verdeckt einen Ladefehler nicht als unbekanntes Camp', async () => {
  vi.mocked(fetchCampsAdmin).mockRejectedValueOnce(new Error('API nicht erreichbar'))
  await expect(NewCampPage({ params, searchParams: Promise.resolve({ von: source.slug }) })).rejects.toThrow('API nicht erreichbar')
})

it('lädt ohne Sitzung keine Quelldaten', async () => {
  vi.mocked(getValidAccessToken).mockResolvedValueOnce(null)
  await expect(NewCampPage({ params, searchParams: Promise.resolve({ von: source.slug }) })).rejects.toThrow('redirect:')
  expect(fetchCampsAdmin).not.toHaveBeenCalled()
})

it('verlinkt auf der Detailseite die Quelle als sekundäre Aktion', () => {
  const html = renderToStaticMarkup(<CampDetailScreen orgSlug={fixtures.orgSlug} org={fixtures.org} campSlug={source.slug} camp={source} registrations={[]} />)
  expect(html).toMatch(new RegExp(`class="[^"]*cp-btn-secondary[^"]*"[^>]*href="/pilot/${fixtures.orgSlug}/camps/new\\?von=${source.slug}"[^>]*>Camp duplizieren</a>`))
})

it.each(['1', 'incomplete'])('zeigt auf der Konfigurationsseite den passenden Kopierhinweis (%s)', async duplicate => {
  const html = renderToStaticMarkup(await CampConfigPage({ params, searchParams: Promise.resolve({ duplicate }) }))
  if (duplicate === '1') expect(html).toContain(DUPLICATE_SUCCESS)
  else {
    expect(html).not.toContain(DUPLICATE_SUCCESS)
    expect(html).toContain('die weiteren Angaben konnten nicht übernommen werden')
  }
})
