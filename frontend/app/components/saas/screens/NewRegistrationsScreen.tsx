import { computeBrandTokens } from '../brandPipeline'
import TodayRegistrations from '../data/TodayRegistrations'
import { orgTabs } from '../navTabs'
import { todayRegistrations } from '../registrationDates'
import MatchdayBand from '../shell/MatchdayBand'
import type { OrganizationScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function NewRegistrationsScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {
  const brand = computeBrandTokens(org.primary_color)
  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`} orgSlug={orgSlug} orgName={org.name} orgLogoUrl={org.logo_url}
        title="Neue Anmeldungen heute" tabs={orgTabs(orgSlug)} brandColor={brand.brand} />
      <main className={PAGE_READING}>
        <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} fullList />
      </main>
    </>
  )
}