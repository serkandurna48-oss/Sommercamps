'use client'

import { usePathname } from 'next/navigation'
import { de } from '../../../lib/i18n/de'
import { computeBrandTokens } from '../brandPipeline'
import { campTabs, orgTabs } from '../navTabs'
import MatchdayBand from '../shell/MatchdayBand'
import { useOrganizationIdentity } from '../shell/OrganizationContext'
import ErrorState from '../state/ErrorState'
import Skeleton from '../state/Skeleton'
import { PAGE } from '../ui/pageLayout'

/** Route fallbacks retain the authenticated club identity and parent navigation. */
export default function AdminRouteState({ reset }: { reset?: () => void }) {
  const segments = usePathname().split('/').filter(Boolean)
  const orgSlug = segments[1]
  const org = useOrganizationIdentity()
  const campSlug = segments[2] === 'camps' && segments[3] !== 'new' ? segments[3] : undefined
  const section = segments.at(-1)
  const titles: Record<string, string> = { ...de.adminRoute.titles, konfiguration: campSlug ? de.adminRoute.campConfiguration : de.adminRoute.titles.konfiguration }
  const backHref = section === 'dashboard' ? undefined : campSlug && section !== campSlug ? `/pilot/${orgSlug}/camps/${campSlug}` : `/pilot/${orgSlug}/dashboard`
  return <>
    <MatchdayBand orgSlug={orgSlug} orgName={org?.name ?? de.adminRoute.organization} orgLogoUrl={org?.logo_url ?? null}
      title={titles[section ?? ''] ?? de.adminRoute.campOverview} backHref={backHref}
      brandColor={computeBrandTokens(org?.primary_color ?? null).brand}
      tabs={campSlug ? campTabs(orgSlug, campSlug) : orgTabs(orgSlug)} />
    <main className={PAGE}>
      {reset ? <ErrorState onRetry={reset} dashboardHref={`/pilot/${orgSlug}/dashboard`} /> : <div role="status" aria-label={de.states.loading}><Skeleton className="mb-4 h-20 w-full" /><Skeleton className="h-48 w-full" /></div>}
    </main>
  </>
}
