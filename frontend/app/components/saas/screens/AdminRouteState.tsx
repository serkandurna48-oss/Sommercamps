'use client'

import { usePathname } from 'next/navigation'
import { computeBrandTokens } from '../brandPipeline'
import { campTabs, orgTabs } from '../navTabs'
import MatchdayBand from '../shell/MatchdayBand'
import { useOrganizationIdentity } from '../shell/OrganizationContext'
import ErrorState from '../state/ErrorState'
import Skeleton from '../state/Skeleton'

/** Route fallbacks retain the authenticated club identity and parent navigation. */
export default function AdminRouteState({ reset }: { reset?: () => void }) {
  const segments = usePathname().split('/').filter(Boolean)
  const orgSlug = segments[1]
  const org = useOrganizationIdentity()
  const campSlug = segments[2] === 'camps' && segments[3] !== 'new' ? segments[3] : undefined
  const section = segments.at(-1)
  const titles: Record<string, string> = { dashboard: 'Übersicht', zahlungen: 'Zahlungen', warteliste: 'Warteliste', aufgaben: 'Aufgaben', anmeldungen: 'Neue Anmeldungen heute', new: 'Neues Camp', konfiguration: campSlug ? 'Camp-Einstellungen' : 'Vereinseinstellungen' }
  const backHref = section === 'dashboard' ? undefined : campSlug && section !== campSlug ? `/pilot/${orgSlug}/camps/${campSlug}` : `/pilot/${orgSlug}/dashboard`
  return <>
    <MatchdayBand orgSlug={orgSlug} orgName={org?.name ?? 'Verein'} orgLogoUrl={org?.logo_url ?? null}
      title={titles[section ?? ''] ?? 'Camp-Übersicht'} backHref={backHref}
      brandColor={computeBrandTokens(org?.primary_color ?? null).brand}
      tabs={campSlug ? campTabs(orgSlug, campSlug) : orgTabs(orgSlug)} />
    <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      {reset ? <ErrorState onRetry={reset} /> : <div role="status" aria-label="Wird geladen …"><Skeleton className="mb-4 h-20 w-full" /><Skeleton className="h-48 w-full" /></div>}
    </main>
  </>
}
