import { loadCampAdminData } from '../../../../../components/saas/orgAdminData'
import CampDetailScreen from '../../../../../components/saas/screens/CampDetailScreen'

export default async function CampCommandCenterPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

<<<<<<< HEAD
  return <CampDetailScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} />
=======
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
        {/* grid-flow-row-dense: die breite Geldkachel (StatCard `wide`) passt
            unter 768px nicht neben die erste Kachel — ohne dense bliebe dort
            ein leeres Feld stehen. */}
        <div className="mb-8 grid grid-flow-row-dense grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Belegung" value={`${stats.registeredCount}/${camp.capacity}`} />
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} wide />
          <StatCard label={de.dashboard.waitlistLabel} value={String(stats.waitlistCount)} numericValue={stats.waitlistCount} />
          <StatCard label="Aufgaben" value={String(openTaskCount)} numericValue={openTaskCount} />
        </div>

        <ParticipantList registrations={registrations} brandColor={brand.brand} orgSlug={orgSlug} campSlug={campSlug} campTitle={camp.title} />
      </main>
    </>
  )
>>>>>>> ux/w2c-storno-warteliste
}
