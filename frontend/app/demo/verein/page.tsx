import Link from 'next/link'
import type { Metadata } from 'next'
import PublicClubView from '../../pilot/[org]/PublicClubView'
import { demoCamps, demoOrganization } from './demoClub'

export const metadata: Metadata = {
  title: 'Demo: Anmeldeseite für Eltern',
  description: 'Beispielseite eines Vereins mit erfundenen Camps. Es wird nichts gespeichert.',
  robots: { index: false, follow: false },
}

// The camps are computed relative to today so they never lie in the past.
export const dynamic = 'force-dynamic'

/**
 * Public, login-free demo of the parent page. Uses the real parent-page components with static
 * data; the registration form answers locally and never calls an API.
 */
export default async function DemoClubPage({ searchParams }: { searchParams?: Promise<{ camp?: string | string[] }> }) {
  const selected = (await searchParams)?.camp
  const camps = demoCamps()
  return (
    <>
      <aside
        id="demo-hinweis"
        role="note"
        style={{ position: 'sticky', top: 0, zIndex: 60, display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', background: '#10161a', color: '#eaeeec', fontSize: 14, lineHeight: 1.4 }}
      >
        <strong>Demo – Beispieldaten</strong>
        <span>Der Verein ist erfunden, es wird nichts gespeichert oder bezahlt.</span>
        <Link href="/demo/dashboard" style={{ color: '#ff9a63', textDecoration: 'underline' }}>Verwaltung ansehen</Link>
        <Link href="/campspilot/registrieren" style={{ color: '#ff9a63', textDecoration: 'underline', fontWeight: 600 }}>Eigenen Verein registrieren</Link>
      </aside>
      <PublicClubView
        org={demoOrganization}
        allCamps={camps}
        camps={camps}
        trainings={[]}
        hadPastCamps={false}
        initialCampSlug={typeof selected === 'string' && camps.some(c => c.slug === selected) ? selected : undefined}
        demo
      />
    </>
  )
}
