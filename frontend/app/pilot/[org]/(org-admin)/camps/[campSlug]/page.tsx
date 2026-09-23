import { computeBrandTokens } from '../../../../../components/saas/brandPipeline'
import { computeCampStats } from '../../../../../components/saas/dashboardLogic'
import { computeMoneyStats } from '../../../../../components/saas/commandCenterLogic'
import { loadCampAdminData } from '../../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../../components/saas/shell/MatchdayBand'
import StatCard from '../../../../../components/saas/data/StatCard'
import ParticipantList from '../../../../../components/saas/data/ParticipantList'
import { campTabs } from '../../../../../components/saas/navTabs'
import { de, formatDateRange, formatEuro } from '../../../../../lib/i18n/de'

export default async function CampCommandCenterPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

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
      <MatchdayBand
        variant="compact"
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
        <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Belegung" value={`${stats.registeredCount}/${camp.capacity}`} />
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} />
          <StatCard label={de.dashboard.waitlistLabel} value={String(stats.waitlistCount)} numericValue={stats.waitlistCount} />
          <StatCard label="Aufgaben" value={String(openTaskCount)} numericValue={openTaskCount} />
        </div>

        <ParticipantList registrations={registrations} brandColor={brand.brand} orgSlug={orgSlug} campSlug={campSlug} />
      </main>
    </>
  )
}
