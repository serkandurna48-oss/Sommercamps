import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicOrganization } from '../../publicData'
import LegalShell from '../../LegalShell'
import PublicLoadError from '../../PublicLoadError'
import BookingView from './BookingView'

// The token is a credential: keep the page out of search engines and never send it as a referrer.
export const metadata: Metadata = {
  title: 'Meine Buchung – CampsPilot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function BookingPage({ params }: { params: Promise<{ org: string; token: string }> }) {
  const { org: orgSlug, token } = await params
  let org
  try {
    org = await getPublicOrganization(orgSlug)
  } catch {
    return <PublicLoadError />
  }
  if (!org) notFound()
  return (
    <LegalShell org={org}>
      <main className="legal-col" lang="de">
        <BookingView orgSlug={org.slug} token={token} org={org} />
      </main>
    </LegalShell>
  )
}
