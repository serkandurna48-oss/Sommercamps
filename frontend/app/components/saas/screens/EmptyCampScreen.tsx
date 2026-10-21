import { computeBrandTokens } from '../brandPipeline'
import { orgTabs } from '../navTabs'
import MatchdayBand from '../shell/MatchdayBand'
import EmptyState from '../state/EmptyState'
import type { OrganizationIdentityProps } from './types'

export default function EmptyCampScreen({ orgSlug, org }: OrganizationIdentityProps) {
  return (
    <>
      <MatchdayBand variant="compact" orgSlug={orgSlug} orgName={org.name} orgLogoUrl={org.logo_url}
        title="Kein Camp vorhanden" tabs={orgTabs(orgSlug)} brandColor={computeBrandTokens(org.primary_color).brand} />
      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <EmptyState title="Noch keine Camps angelegt" />
      </main>
    </>
  )
}
