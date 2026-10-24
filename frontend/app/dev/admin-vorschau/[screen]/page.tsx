import Link from 'next/link'
import { notFound } from 'next/navigation'
import AdminShell from '../../../components/saas/shell/AdminShell'
import OrgDashboardScreen from '../../../components/saas/screens/OrgDashboardScreen'
import CampDetailScreen from '../../../components/saas/screens/CampDetailScreen'
import CampCreateScreen from '../../../components/saas/screens/CampCreateScreen'
import CampConfigScreen from '../../../components/saas/screens/CampConfigScreen'
import OrgPaymentsScreen from '../../../components/saas/screens/OrgPaymentsScreen'
import OrgWaitlistScreen from '../../../components/saas/screens/OrgWaitlistScreen'
import OrgTasksScreen from '../../../components/saas/screens/OrgTasksScreen'
import OrgConfigScreen from '../../../components/saas/screens/OrgConfigScreen'
import CampPaymentsScreen from '../../../components/saas/screens/CampPaymentsScreen'
import CampWaitlistScreen from '../../../components/saas/screens/CampWaitlistScreen'
import CampTasksScreen from '../../../components/saas/screens/CampTasksScreen'
import NewRegistrationsScreen from '../../../components/saas/screens/NewRegistrationsScreen'
import HilfeScreen from '../../../components/saas/screens/HilfeScreen'
import {
  getPreviewFixtures,
  getPreviewFixturesDashboardStep1,
  getPreviewFixturesDashboardStep3,
  getPreviewFixturesEinrichtung1,
  getPreviewFixturesEinrichtung2,
  getPreviewFixturesEinrichtung3,
  getPreviewFixturesEinrichtung4Open,
  getPreviewFixturesEinrichtung4Full,
} from '../fixtures'
import EinrichtungScreen from '../../../components/saas/screens/EinrichtungScreen'
import PreviewProvider from '../PreviewProvider'

export const metadata = { title: 'Admin-Vorschau – CampsPilot', robots: { index: false, follow: false } }

type Props = {
  params: Promise<{ screen: string }>
  searchParams?: Promise<{ leer?: string | string[]; filter?: string | string[]; sort?: string | string[]; camp?: string | string[]; schritt?: string | string[]; voll?: string | string[] }>
}

export default async function AdminPreviewPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound()

  const { screen } = await params
  const query = await searchParams
  const empty = query?.leer === '1'
  const schritt = typeof query?.schritt === 'string' ? parseInt(query.schritt, 10) : undefined
  const fixtures = getPreviewFixtures(empty)
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
        schritt === 1 || empty ? getPreviewFixturesDashboardStep1() :
        schritt === 3 ? getPreviewFixturesDashboardStep3() :
        schritt === 2 ? getPreviewFixtures(true) :
        fixtures
      content = <OrgDashboardScreen {...dashboardFixtures} />; break
    }
    case 'anmeldungen': content = <NewRegistrationsScreen {...fixtures} />; break
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
    case 'hilfe': content = <HilfeScreen orgSlug={fixtures.orgSlug} org={fixtures.org} />; break
    case 'einrichtung': {
      const f = schritt === 2 ? getPreviewFixturesEinrichtung2()
        : schritt === 3 ? getPreviewFixturesEinrichtung3()
        : schritt === 4 ? getPreviewFixturesEinrichtung4Open()
        : getPreviewFixturesEinrichtung1()
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={schritt ?? 1} />
      break
    }
    case 'einrichtung-1': {
      const f = getPreviewFixturesEinrichtung1()
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={1} />
      break
    }
    case 'einrichtung-2': {
      const f = getPreviewFixturesEinrichtung2()
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={2} />
      break
    }
    case 'einrichtung-3': {
      const f = getPreviewFixturesEinrichtung3()
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={3} />
      break
    }
    case 'einrichtung-4': {
      const useVoll = query?.voll === '1'
      const f = useVoll ? getPreviewFixturesEinrichtung4Full() : getPreviewFixturesEinrichtung4Open()
      content = <EinrichtungScreen orgSlug={f.orgSlug} org={f.org} camps={f.camps} requestedStep={4} />
      break
    }
    default: notFound()
  }

  return (
    <AdminShell>
      <PreviewProvider empty={empty}>
        <aside className="cp-chip flex flex-wrap items-center justify-between gap-3 px-4 py-2" style={{ background: 'var(--cp-surface-2)', color: 'var(--cp-ink)' }}>
          <Link href="/dev/admin-vorschau" className="underline">Alle Vorschauen</Link>
          <span>Vorschau · erfundene Daten · Änderungen werden nicht gespeichert</span>
          <Link href={`/dev/admin-vorschau/${screen}${empty ? '' : '?leer=1'}`} className="underline">
            {empty ? 'Beispieldaten anzeigen' : 'Leerzustand anzeigen'}
          </Link>
        </aside>
        {content}
      </PreviewProvider>
    </AdminShell>
  )
}
