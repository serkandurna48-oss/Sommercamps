import { computeBrandTokens } from '../brandPipeline'
import { computeMoneyStats, isOpenPayment } from '../commandCenterLogic'
import MatchdayBand from '../shell/MatchdayBand'
import PaymentSection, { type PaymentEntry } from '../data/PaymentSection'
import StatCard from '../data/StatCard'
import StatGrid from '../ui/StatGrid'
import { campTabs } from '../navTabs'
import { de, formatDateRange, formatEuro } from '../../../lib/i18n/de'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'
import { PAGE } from '../ui/pageLayout'

export default function CampPaymentsScreen({ orgSlug, campSlug, org, camp, registrations, initialFilter = 'open' }: CampScreenProps & { initialFilter?: 'open' | 'paid' | 'all' }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const brand = computeBrandTokens(org.primary_color)
  const money = computeMoneyStats(camp, registrations)
  const entries: PaymentEntry[] = registrations.map(registration => ({ registration, camp }))
  const openCount = entries.filter(e => isOpenPayment(e.registration)).length

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/camps/${campSlug}`}
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

      <main className={PAGE}>
        <StatGrid>
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} wide />
          <StatCard label={de.command.filterPaymentOpen} value={String(openCount)} numericValue={openCount} tone="pending" />
        </StatGrid>
        <p className="cp-hint mt-2 mb-6">Beträge berechnet aus den aktuellen Anmeldungen und dem Campreis.</p>

        <PaymentSection
          org={{ name: org.name, legal_name: org.legal_name, iban: org.iban, contact_person_name: org.contact_person_name, contact_email: org.contact_email }}
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
