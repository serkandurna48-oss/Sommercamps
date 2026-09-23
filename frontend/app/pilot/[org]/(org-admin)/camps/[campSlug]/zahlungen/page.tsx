import { computeBrandTokens } from '../../../../../../components/saas/brandPipeline'
import { computeMoneyStats } from '../../../../../../components/saas/commandCenterLogic'
import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../../../components/saas/shell/MatchdayBand'
import PaymentSection, { type PaymentEntry } from '../../../../../../components/saas/data/PaymentSection'
import StatCard from '../../../../../../components/saas/data/StatCard'
import { campTabs } from '../../../../../../components/saas/navTabs'
import { de, formatDateRange, formatEuro } from '../../../../../../lib/i18n/de'

export default async function CampPaymentsPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

  const brand = computeBrandTokens(org.primary_color)
  const money = computeMoneyStats(camp, registrations)
  const entries: PaymentEntry[] = registrations.map(registration => ({ registration, camp }))
  const openCount = entries.filter(e => e.registration.payment_status === 'open').length

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        subtitle={formatDateRange(camp.start_date, camp.end_date)}
        metrics={[
          { label: de.paymentsPage.collected, value: formatEuro(money.collectedCents) },
          { label: de.paymentsPage.open, value: formatEuro(money.openCents) },
        ]}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-3">
          <StatCard label={de.paymentsPage.collected} value={formatEuro(money.collectedCents)} />
          <StatCard label={de.paymentsPage.open} value={formatEuro(money.openCents)} />
          <StatCard label={de.command.filterPaymentOpen} value={String(openCount)} numericValue={openCount} />
        </div>

        <PaymentSection
          entries={entries}
          orgSlug={orgSlug}
          brandColor={brand.brand}
          brandStrong={brand.brandStrong}
          brandOn={brand.brandOn}
          emptyLabel={de.paymentsPage.emptyCamp}
          csvFilename={`${campSlug}-zahlungen.csv`}
          xlsxHref={`/pilot/${orgSlug}/camps/${campSlug}/export?view=payments`}
        />
      </main>
    </>
  )
}
