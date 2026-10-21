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
import { getPreviewFixtures } from '../fixtures'
import PreviewProvider from '../PreviewProvider'

export const metadata = { title: 'Admin-Vorschau – CampsPilot', robots: { index: false, follow: false } }

type Props = {
  params: Promise<{ screen: string }>
  searchParams?: Promise<{ leer?: string | string[] }>
}

export default async function AdminPreviewPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound()

  const { screen } = await params
  const empty = (await searchParams)?.leer === '1'
  const fixtures = getPreviewFixtures(empty)
  const camp = fixtures.camps[0]
  const campProps = { orgSlug: fixtures.orgSlug, org: fixtures.org, camp, campSlug: camp?.slug ?? '', registrations: fixtures.registrationsByCamp[0] ?? [] }
  let content: React.ReactNode
  switch (screen) {
    case 'dashboard': content = <OrgDashboardScreen {...fixtures} />; break
    case 'camp': content = <CampDetailScreen {...campProps} />; break
    case 'camp-neu': content = <CampCreateScreen {...fixtures} />; break
    case 'camp-konfiguration': content = <CampConfigScreen {...campProps} />; break
    case 'zahlungen': content = <OrgPaymentsScreen {...fixtures} />; break
    case 'warteliste': content = <OrgWaitlistScreen {...fixtures} />; break
    case 'aufgaben': content = <OrgTasksScreen {...fixtures} />; break
    case 'konfiguration': content = <OrgConfigScreen {...fixtures} />; break
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
