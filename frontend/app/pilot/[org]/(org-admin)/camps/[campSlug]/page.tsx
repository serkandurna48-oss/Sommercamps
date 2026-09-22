import { notFound, redirect } from 'next/navigation'
import { computeBrandTokens } from '../../../../../components/saas/brandPipeline'
import { computeCampStats } from '../../../../../components/saas/dashboardLogic'
import { computeMoneyStats } from '../../../../../components/saas/commandCenterLogic'
import MatchdayBand from '../../../../../components/saas/shell/MatchdayBand'
import StatCard from '../../../../../components/saas/data/StatCard'
import ParticipantList from '../../../../../components/saas/data/ParticipantList'
import { campTabs } from '../../../../../components/saas/navTabs'
import { de, formatDateRange, formatEuro } from '../../../../../lib/i18n/de'
import { getAdminToken } from '../../../../../lib/adminSession'
import { AdminAuthError, fetchCampsAdmin, fetchRegistrationsAdmin } from '../../../../../lib/saasAdminApi'
import { fetchOrganization } from '../../../../../lib/saasApi'

export default async function CampCommandCenterPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganization(orgSlug)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  let camps
  let registrations
  try {
    camps = await fetchCampsAdmin(orgSlug, token)
    registrations = await fetchRegistrationsAdmin(orgSlug, campSlug, token)
  } catch (err) {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  }

  const camp = camps.find(c => c.slug === campSlug)
  if (!camp) notFound()

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

      <main className="mx-auto max-w-[1080px] px-6 py-10">
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Belegung" value={`${stats.registeredCount}/${camp.capacity}`} />
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} />
          <StatCard label={de.dashboard.waitlistLabel} value={String(stats.waitlistCount)} />
          <StatCard label="Aufgaben" value={String(openTaskCount)} />
        </div>

        <ParticipantList registrations={registrations} brandColor={brand.brand} />
      </main>
    </>
  )
}
