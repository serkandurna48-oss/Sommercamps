import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import { computeMoneyStats, isOpenPayment } from '../../../../components/saas/commandCenterLogic'
import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import PaymentSection, { type PaymentEntry } from '../../../../components/saas/data/PaymentSection'
import StatCard from '../../../../components/saas/data/StatCard'
import { orgTabs } from '../../../../components/saas/navTabs'
import { de, formatEuro } from '../../../../lib/i18n/de'

export default async function OrgPaymentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  const brand = computeBrandTokens(org.primary_color)

  const money = camps.reduce(
    (sum, camp, i) => {
      const m = computeMoneyStats(camp, registrationsByCamp[i])
      return { collectedCents: sum.collectedCents + m.collectedCents, openCents: sum.openCents + m.openCents }
    },
    { collectedCents: 0, openCents: 0 },
  )

  const entries: PaymentEntry[] = camps.flatMap((camp, i) => registrationsByCamp[i].map(registration => ({ registration, camp })))
  const openCount = entries.filter(e => isOpenPayment(e.registration)).length

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.command.payments}
        metrics={[
          { label: de.paymentsPage.collected, value: formatEuro(money.collectedCents) },
          { label: de.paymentsPage.open, value: formatEuro(money.openCents) },
        ]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.paymentsPage.heading}
        </h2>
        <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
          {de.paymentsPage.subtitleOrg}
        </p>

        <div className="mb-8">
          <StatCard label={de.command.filterPaymentOpen} value={String(openCount)} numericValue={openCount} />
        </div>

        <PaymentSection
          entries={entries}
          orgSlug={orgSlug}
          brandColor={brand.brand}
          emptyLabel={de.paymentsPage.emptyOrg}
          showCampTitle
          csvFilename={`${orgSlug}-zahlungen.csv`}
          xlsxHref={`/pilot/${orgSlug}/export?view=payments`}
        />
      </main>
    </>
  )
}
