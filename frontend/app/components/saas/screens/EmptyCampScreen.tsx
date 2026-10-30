import { computeBrandTokens } from '../brandPipeline'
import { orgTabs } from '../navTabs'
import MatchdayBand from '../shell/MatchdayBand'
import EmptyState from '../state/EmptyState'
import type { OrganizationIdentityProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function EmptyCampScreen({ orgSlug, org }: OrganizationIdentityProps) {
  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`} orgSlug={orgSlug} orgName={org.name} orgLogoUrl={org.logo_url}
        title="Kein Camp vorhanden" tabs={orgTabs(orgSlug)} brandColor={computeBrandTokens(org.primary_color).brand} />
      <main className={PAGE_READING}>
        <EmptyState title="Noch keine Camps angelegt" />
      </main>
    </>
  )
}
