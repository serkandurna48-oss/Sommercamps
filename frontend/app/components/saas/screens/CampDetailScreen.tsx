import type { ParticipantFilter } from '../commandCenterLogic'
import type { ParticipantSort } from '../registrationDates'
import EmptyCampScreen from './EmptyCampScreen'
import { computeBrandTokens } from '../brandPipeline'
import { computeCampStats } from '../dashboardLogic'
import { computeMoneyStats } from '../commandCenterLogic'
import MatchdayBand from '../shell/MatchdayBand'
import StatCard from '../data/StatCard'
import StatGrid from '../ui/StatGrid'
import { ButtonLink } from '../ui/Button'
import ParticipantList from '../data/ParticipantList'
import { campTabs } from '../navTabs'
import { de, formatDateRange, formatEuro } from '../../../lib/i18n/de'
import type { CampScreenProps } from './types'

export default function CampDetailScreen({ orgSlug, campSlug, org, camp, registrations, initialFilter = 'all', initialSort = 'newest' }: CampScreenProps & { initialFilter?: ParticipantFilter; initialSort?: ParticipantSort }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const stats = computeCampStats(camp, registrations)
  const money = computeMoneyStats(camp, registrations)
  const brand = computeBrandTokens(org.primary_color)

  const tabs = campTabs(orgSlug, campSlug)

  const openTaskCount =
    (stats.openPaymentsCount > 0 ? 1 : 0) +
    (stats.missingEmergencyContactCount > 0 ? 1 : 0) +
    (stats.waitlistCount > 0 ? 1 : 0)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        subtitle={formatDateRange(camp.start_date, camp.end_date)}
        metrics={[{ label: de.dashboard.spotsLabel, value: `${stats.registeredCount}/${camp.capacity}` }]}
        tabs={tabs}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <div className="mb-6 flex justify-end">
          <ButtonLink variant="secondary" href={`/pilot/${orgSlug}/camps/new?von=${encodeURIComponent(campSlug)}`}>Camp duplizieren</ButtonLink>
        </div>
        <StatGrid>
          <StatCard label="Belegung" value={`${stats.registeredCount}/${camp.capacity}`} />
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} wide />
          <StatCard label={de.dashboard.waitlistLabel} value={String(stats.waitlistCount)} numericValue={stats.waitlistCount} />
          <StatCard label="Aufgaben" value={String(openTaskCount)} numericValue={openTaskCount} />
        </StatGrid>

        <ParticipantList key={`${campSlug}-${initialFilter}-${initialSort}`} initialFilter={initialFilter} initialSort={initialSort} registrations={registrations} brandColor={brand.brand} orgSlug={orgSlug} orgName={org.name} campSlug={campSlug} camp={camp} questions={org.registration_questions ?? []} />
      </main>
    </>
  )
}
