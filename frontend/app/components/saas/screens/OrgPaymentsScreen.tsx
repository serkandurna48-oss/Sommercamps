import { computeBrandTokens } from '../brandPipeline'
import { computeMoneyStats, isOpenPayment } from '../commandCenterLogic'
import MatchdayBand from '../shell/MatchdayBand'
import PaymentSection, { type PaymentEntry } from '../data/PaymentSection'
import StatCard from '../data/StatCard'
import StatGrid from '../ui/StatGrid'
import { orgTabs } from '../navTabs'
import { de, formatEuro } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'

export default function OrgPaymentsScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {

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
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
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

        <p className="cp-body mb-4" style={{ color: 'var(--cp-muted)' }}>berechnet aus aktuellen Anmeldungen und Campreis</p>
        <StatGrid>
          <StatCard label="Eingegangen / Offen" value={`${formatEuro(money.collectedCents)} / ${formatEuro(money.openCents)}`} wide />
          <StatCard label={de.command.filterPaymentOpen} value={String(openCount)} numericValue={openCount} tone="pending" />
        </StatGrid>

        <PaymentSection
          org={{ name: org.name, legal_name: org.legal_name, iban: org.iban, contact_person_name: org.contact_person_name, contact_email: org.contact_email }}
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
