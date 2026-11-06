'use client'

import { usePathname } from 'next/navigation'
import { de } from '../../../lib/i18n/de'
import { campTabs } from '../navTabs'
import PageHeader from '../shell/PageHeader'
import ErrorState from '../state/ErrorState'
import Skeleton from '../state/Skeleton'
import { ADMIN_PAGE } from '../ui/pageLayout'

/** Route fallbacks retain the authenticated club identity and parent navigation. */
export default function AdminRouteState({ reset }: { reset?: () => void }) {
  const segments = usePathname().split('/').filter(Boolean)
  const orgSlug = segments[1]
  const campSlug = segments[2] === 'camps' && segments[3] !== 'new' ? segments[3] : undefined
  const section = segments.at(-1)
  const titles: Record<string, string> = { ...de.adminRoute.titles, konfiguration: campSlug ? de.adminRoute.campConfiguration : de.adminRoute.titles.konfiguration }
  const backHref = campSlug || segments[3] === 'new' ? `/pilot/${orgSlug}/camps` : undefined
  return <>
    <PageHeader
        title={titles[section ?? ''] ?? de.adminRoute.campOverview}
        backHref={backHref}
        backLabel="Alle Camps"
        tabs={campSlug ? campTabs(orgSlug, campSlug) : undefined}
        tabsLabel="Camp-Bereiche"
      />
    <main className={ADMIN_PAGE}>
      {reset ? <ErrorState onRetry={reset} dashboardHref={`/pilot/${orgSlug}/dashboard`} /> : <div role="status" aria-label={de.states.loading}><Skeleton className="mb-4 h-20 w-full" /><Skeleton className="h-48 w-full" /></div>}
    </main>
  </>
}
