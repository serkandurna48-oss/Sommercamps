import { computeBrandTokens } from '../../../../../../components/saas/brandPipeline'
import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../../../components/saas/shell/MatchdayBand'
import WaitlistCard from '../../../../../../components/saas/data/WaitlistCard'
import WaitlistExportBar from '../../../../../../components/saas/data/WaitlistExportBar'
import EmptyState from '../../../../../../components/saas/state/EmptyState'
import { campTabs } from '../../../../../../components/saas/navTabs'
import { de, formatDateRange } from '../../../../../../lib/i18n/de'
import type { WaitlistExportRow } from '../../../../../../components/saas/waitlistExport'

export default async function CampWaitlistPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

  const waitlisted = registrations.filter(r => r.status === 'waitlist')
  const brand = computeBrandTokens(org.primary_color)
  const exportRows: WaitlistExportRow[] = waitlisted.map((registration, i) => ({ camp, position: i + 1, registration }))

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        subtitle={formatDateRange(camp.start_date, camp.end_date)}
        metrics={[{ label: de.command.waitlist, value: String(waitlisted.length) }]}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-6" style={{ color: 'var(--cp-ink)' }}>
          {de.waitlistPage.heading}
        </h2>

        {waitlisted.length === 0 ? (
          <EmptyState title={de.waitlistPage.emptyCamp} />
        ) : (
          <>
            <WaitlistExportBar
              rows={exportRows}
              showCampTitle={false}
              csvFilename={`${campSlug}-warteliste.csv`}
              xlsxHref={`/pilot/${orgSlug}/camps/${campSlug}/export?view=waitlist`}
            />
            <WaitlistCard
              orgSlug={orgSlug}
              campSlug={campSlug}
              campTitle={camp.title}
              waitlisted={waitlisted}
              brandColor={brand.brand}
              brandStrong={brand.brandStrong}
              brandOn={brand.brandOn}
            />
          </>
        )}
      </main>
    </>
  )
}
