import { computeBrandTokens } from '../brandPipeline'
import TodayRegistrations from '../data/TodayRegistrations'
import { orgTabs } from '../navTabs'
import { todayRegistrations } from '../registrationDates'
import MatchdayBand from '../shell/MatchdayBand'
import type { OrganizationScreenProps } from './types'

export default function NewRegistrationsScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {
  const brand = computeBrandTokens(org.primary_color)
  return (
    <>
      <MatchdayBand variant="compact" orgSlug={orgSlug} orgName={org.name} orgLogoUrl={org.logo_url}
        title="Neue Anmeldungen heute" tabs={orgTabs(orgSlug)} brandColor={brand.brand} backToCamps />
      <main className="mx-auto max-w-[920px] px-4 py-8 md:px-8">
        <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} fullList />
      </main>
    </>
  )
}