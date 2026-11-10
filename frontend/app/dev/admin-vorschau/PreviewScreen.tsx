import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { OrganizationAdmin } from '../../lib/saasAdminApi'
import AdminShell from '../../components/saas/shell/AdminShell'
import OrgDashboardScreen from '../../components/saas/screens/OrgDashboardScreen'
import CampDetailScreen from '../../components/saas/screens/CampDetailScreen'
import CampsScreen from '../../components/saas/screens/CampsScreen'
import CampCreateScreen from '../../components/saas/screens/CampCreateScreen'
import CampConfigScreen from '../../components/saas/screens/CampConfigScreen'
import OrgPaymentsScreen from '../../components/saas/screens/OrgPaymentsScreen'
import OrgWaitlistScreen from '../../components/saas/screens/OrgWaitlistScreen'
import OrgTasksScreen from '../../components/saas/screens/OrgTasksScreen'
import OrgConfigScreen from '../../components/saas/screens/OrgConfigScreen'
import CampPaymentsScreen from '../../components/saas/screens/CampPaymentsScreen'
import CampWaitlistScreen from '../../components/saas/screens/CampWaitlistScreen'
import CampTasksScreen from '../../components/saas/screens/CampTasksScreen'
import NewRegistrationsScreen from '../../components/saas/screens/NewRegistrationsScreen'
import HilfeScreen from '../../components/saas/screens/HilfeScreen'
import {
  getPreviewFixtures,
  getPreviewFixturesConfigDraft,
  getPreviewFixturesWaitlistFreeSpots,
  getPreviewFixturesDashboardStep1,
  getPreviewFixturesDashboardStep3,
  getPreviewFixturesEinrichtung1,
  getPreviewFixturesEinrichtung2,
  getPreviewFixturesEinrichtung3,
  getPreviewFixturesEinrichtung4Open,
  getPreviewFixturesEinrichtung4Full,
} from './fixtures'
import EinrichtungScreen from '../../components/saas/screens/EinrichtungScreen'
import PreviewProvider from './PreviewProvider'

export type PreviewQuery = { leer?: string | string[]; filter?: string | string[]; sort?: string | string[]; camp?: string | string[]; schritt?: string | string[]; voll?: string | string[] }

export type PreviewOptions = {
  screen: string
  query?: PreviewQuery
  /** Where the preview screens are mounted (dev preview or public demo). */
  basePath?: string
  /** Target of "parent link" actions inside the preview. */
  parentHref?: string
  /** Replaces the default dev banner above the content. */
  banner?: React.ReactNode
  /** Applied to every fixture set, e.g. to swap in a fully synthetic demo club. */
  withOrg?: <T extends { orgSlug: string; org: OrganizationAdmin }>(fixtures: T) => T
}

/** Renders one admin screen with static fixtures. No authentication, no network. Shared by /dev/admin-vorschau and /demo/dashboard. */
export function renderAdminPreview({ screen, query, basePath = '/dev/admin-vorschau', parentHref, banner, withOrg }: PreviewOptions) {
  const fx = <T extends { orgSlug: string; org: OrganizationAdmin }>(f: T): T => (withOrg ? withOrg(f) : f)
  const empty = query?.leer === '1'
  const schritt = typeof query?.schritt === 'string' ? parseInt(query.schritt, 10) : undefined
  const fixtures = fx(getPreviewFixtures(empty))
  const campIndex = Math.max(0, fixtures.camps.findIndex(camp => camp.slug === query?.camp))
  const camp = fixtures.camps[campIndex]
  const campProps = { orgSlug: fixtures.orgSlug, org: fixtures.org, camp, campSlug: camp?.slug ?? '', registrations: fixtures.registrationsByCamp[campIndex] ?? [] }
  const initialFilter = query?.filter === 'missing-info' || query?.filter === 'payment-open' ? query.filter : 'all'
  const initialSort = query?.sort === 'name' ? 'name' : 'newest'
  const paymentFilter = query?.filter === 'paid' || query?.filter === 'all' ? query.filter : 'open'
  let content: React.ReactNode
  switch (screen) {
    case 'dashboard': {
      const dashboardFixtures =
        schritt === 1 || empty ? fx(getPreviewFixturesDashboardStep1()) :
        schritt === 3 ? fx(getPreviewFixturesDashboardStep3()) :
        schritt === 2 ? fx(getPreviewFixtures(true)) :
        fixtures
      content = <OrgDashboardScreen {...dashboardFixtures} />; break
    }
    case 'anmeldungen': content = <NewRegistrationsScreen {...fixtures} />; break
    case 'camps': content = <CampsScreen {...fixtures} />; break
    case 'camp': content = <CampDetailScreen {...campProps} initialFilter={initialFilter} initialSort={initialSort} />; break
    case 'camp-zahlungen': content = <CampPaymentsScreen {...campProps} initialFilter={paymentFilter} />; break
    case 'camp-warteliste': content = <CampWaitlistScreen {...campProps} />; break
    case 'camp-aufgaben': content = <CampTasksScreen {...campProps} />; break
    case 'camp-neu': content = <CampCreateScreen {...fixtures} />; break
    case 'camp-konfiguration': content = <CampConfigScreen {...campProps} />; break
    case 'zahlungen': content = <OrgPaymentsScreen {...fixtures} />; break
    case 'warteliste': content = <OrgWaitlistScreen {...fixtures} />; break
    case 'aufgaben': content = <OrgTasksScreen {...fixtures} />; break
    case 'konfiguration': content = <OrgConfigScreen {...fixtures} />; break
    case 'konfiguration-entwurf': content = <OrgConfigScreen {...(empty ? fixtures : fx(getPreviewFixturesConfigDraft()))} />; break
    case 'camp-konfiguration-entwurf': {
      const f = empty ? fixtures : fx(getPreviewFixturesConfigDraft())
      content = <CampConfigScreen {...campProps} org={f.org} camp={f.camps[0]} />
      break
    }
    case 'warteliste-plaetze': content = <OrgWaitlistScreen {...(empty ? fixtures : fx(getPreviewFixturesWaitlistFreeSpots()))} />; break
    case 'hilfe': content = <HilfeScreen orgSlug={fixtures.orgSlug} org={fixtures.org} />; break
    case 'einrichtung': {
      const f = schritt === 2 ? fx(getPreviewFixturesEinrichtung2())
        : schritt === 3 ? fx(getPreviewFixturesEinrichtung3())
        : schritt === 4 ? fx(getPreviewFixturesEinrichtung4Open())
        : fx(getPreviewFixturesEinrichtung1())
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={schritt ?? 1} />
      break
    }
    case 'einrichtung-1': {
      const f = fx(getPreviewFixturesEinrichtung1())
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={1} />
      break
    }
    case 'einrichtung-2': {
      const f = fx(getPreviewFixturesEinrichtung2())
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={2} />
      break
    }
    case 'einrichtung-3': {
      const f = fx(getPreviewFixturesEinrichtung3())
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={3} />
      break
    }
    case 'einrichtung-4': {
      const useVoll = query?.voll === '1'
      const f = useVoll ? fx(getPreviewFixturesEinrichtung4Full()) : fx(getPreviewFixturesEinrichtung4Open())
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={4} />
      break
    }
    default: notFound()
  }

  return (
    <PreviewProvider empty={empty} basePath={basePath} parentHref={parentHref}>
      <AdminShell
        orgSlug={fixtures.orgSlug}
        org={fixtures.org}
        beforeContent={
          banner ?? (
          <aside className="cp-chip flex flex-wrap items-center justify-between gap-3 px-4 py-2" style={{ background: 'var(--cp-surface-2)', color: 'var(--cp-ink)' }}>
            <Link href={basePath} className="underline">Alle Vorschauen</Link>
            <span>Vorschau · erfundene Daten · Änderungen werden nicht gespeichert</span>
            <Link href={`${basePath}/${screen}${empty ? '' : '?leer=1'}`} className="underline">
              {empty ? 'Beispieldaten anzeigen' : 'Leerzustand anzeigen'}
            </Link>
          </aside>)
        }
      >
        {content}
      </AdminShell>
    </PreviewProvider>
  )
}
