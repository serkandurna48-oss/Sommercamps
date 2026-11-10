import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { renderAdminPreview, type PreviewQuery } from '../../../dev/admin-vorschau/PreviewScreen'
import { previewScreens } from '../../../dev/admin-vorschau/screens'
import { withDemoOrg } from '../../demoOrg'

export const metadata: Metadata = {
  title: 'Demo: Vereins-Dashboard',
  description: 'Beispielansicht des CampsPilot-Verwaltungsbereichs mit erfundenen Daten.',
  robots: { index: false, follow: false },
}

const DEMO_DASHBOARD_BASE = '/demo/dashboard'
const SCREENS: ReadonlySet<string> = new Set(previewScreens.map(([screen]) => screen))

/**
 * Public, login-free demo of the club admin. Static fixtures only: no API call, no cookie, no session.
 * Uses the real admin screens (same components as /pilot/[org]) through the offline preview context.
 */
export default async function DemoDashboardPage({ params, searchParams }: {
  params: Promise<{ screen?: string[] }>
  searchParams?: Promise<PreviewQuery>
}) {
  const segments = (await params).screen ?? []
  if (segments.length > 1) notFound()
  const screen = segments[0] ?? 'dashboard'
  if (!SCREENS.has(screen)) notFound()
  const query = await searchParams
  const empty = query?.leer === '1'

  return renderAdminPreview({
    screen,
    query,
    basePath: DEMO_DASHBOARD_BASE,
    parentHref: '/demo/verein',
    withOrg: withDemoOrg,
    banner: (
      <aside role="note" className="cp-chip flex flex-wrap items-center justify-between gap-3 px-4 py-2" style={{ background: 'var(--cp-surface-2)', color: 'var(--cp-ink)' }}>
        <strong>Demo – Beispieldaten</strong>
        <span>Verein „FC Beispielstadt“ ist erfunden. Änderungen werden nicht gespeichert.</span>
        <span className="flex flex-wrap gap-4">
          <Link href={`${DEMO_DASHBOARD_BASE}/${screen}${empty ? '' : '?leer=1'}`} className="underline">{empty ? 'Beispieldaten anzeigen' : 'Leerzustand anzeigen'}</Link>
          <Link href="/demo/verein" className="underline">Seite für Eltern ansehen</Link>
          <Link href="/campspilot/registrieren" className="font-semibold underline">Eigenen Verein registrieren</Link>
        </span>
      </aside>
    ),
  })
}
