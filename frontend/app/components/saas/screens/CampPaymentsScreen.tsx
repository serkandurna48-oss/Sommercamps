import { computeBrandTokens } from '../brandPipeline'
import { computeMoneyStats, isOpenPayment } from '../commandCenterLogic'
import MatchdayBand from '../shell/MatchdayBand'
import PaymentSection, { type PaymentEntry } from '../data/PaymentSection'
import StatCard from '../data/StatCard'
import { campTabs } from '../navTabs'
import { de, formatDateRange, formatEuro } from '../../../lib/i18n/de'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'

export default function CampPaymentsScreen({ orgSlug, campSlug, org, camp, registrations, initialFilter = 'open' }: CampScreenProps & { initialFilter?: 'open' | 'paid' | 'all' }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const brand = computeBrandTokens(org.primary_color)
  const money = computeMoneyStats(camp, registrations)
  const entries: PaymentEntry[] = registrations.map(registration => ({ registration, camp }))
  const openCount = entries.filter(e => isOpenPayment(e.registration)).length

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        backToCamps
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
        <p className="cp-body mb-4" style={{ color: 'var(--cp-muted)' }}>berechnet aus aktuellen Anmeldungen und Campreis</p>
        <div className="mb-8">
          <StatCard label={de.command.filterPaymentOpen} value={String(openCount)} numericValue={openCount} tone="pending" />
        </div>

        <PaymentSection
          key={`${campSlug}-${initialFilter}`}
          initialFilter={initialFilter}
          entries={entries}
          orgSlug={orgSlug}
          brandColor={brand.brand}
          emptyLabel={de.paymentsPage.emptyCamp}
          csvFilename={`${campSlug}-zahlungen.csv`}
          xlsxHref={`/pilot/${orgSlug}/camps/${campSlug}/export?view=payments`}
        />
      </main>
    </>
  )
}
