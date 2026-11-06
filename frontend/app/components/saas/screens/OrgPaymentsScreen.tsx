import { computeMoneyStats, isOpenPayment } from '../commandCenterLogic'
import PageHeader from '../shell/PageHeader'
import PaymentSection, { type PaymentEntry } from '../data/PaymentSection'
import { de, formatEuro } from '../../../lib/i18n/de'
import type { OrgPaymentsScreenProps } from './types'
import { ADMIN_PAGE } from '../ui/pageLayout'
import { hasModule } from '../../../lib/orgModules'
import InvoiceList from '../billing/InvoiceList'

export default function OrgPaymentsScreen({ orgSlug, org, camps, registrationsByCamp, trainingPayments = [], trainingPaymentsError = false, invoices }: OrgPaymentsScreenProps) {
  const trainingsOn = hasModule(org, 'trainings')

  const groups = [
    ...camps.map((camp, i) => ({ camp, registrations: registrationsByCamp[i] })),
    ...trainingPayments,
  ]
  const money = groups.reduce(
    (sum, { camp, registrations }) => {
      const m = computeMoneyStats(camp, registrations)
      return { collectedCents: sum.collectedCents + m.collectedCents, openCents: sum.openCents + m.openCents }
    },
    { collectedCents: 0, openCents: 0 },
  )

  const entries: PaymentEntry[] = groups.flatMap(({ camp, registrations }) => registrations.map(registration => ({ registration, camp })))
  const openCount = entries.filter(e => isOpenPayment(e.registration)).length

  return (
    <>
      <PageHeader
        title={de.command.payments}
        subtitle={de.paymentsPage.subtitleOrg}
        metrics={[
          { label: 'Eingegangen', value: formatEuro(money.collectedCents) },
          { label: 'Offen', value: formatEuro(money.openCents) },
          { label: de.command.filterPaymentOpen, value: String(openCount) },
        ]}
      />

      <main className={ADMIN_PAGE}>
        {trainingsOn && trainingPaymentsError && (
          <p role="alert" className="cp-body mb-4 rounded-[var(--cp-r-chip)] border px-3 py-2"
            style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
            Trainingszahlungen konnten nicht geladen werden.
          </p>
        )}
        <p className="cp-hint mb-4">{trainingsOn
          ? 'Beträge berechnet aus den aktuellen Anmeldungen und dem Camp- bzw. Trainingspreis.'
          : 'Beträge berechnet aus den aktuellen Anmeldungen und dem Camppreis.'}</p>

        <PaymentSection
          org={{ name: org.name, legal_name: org.legal_name, iban: org.iban, contact_person_name: org.contact_person_name, contact_email: org.contact_email }}
          entries={entries}
          orgSlug={orgSlug}
          emptyLabel={de.paymentsPage.emptyOrg}
          showCampTitle
          csvFilename={`${orgSlug}-zahlungen.csv`}
          xlsxHref={`/pilot/${orgSlug}/export?view=payments`}
          memberPrices={hasModule(org, 'members')}
        />

        {invoices !== undefined && <InvoiceList orgSlug={orgSlug} data={invoices} />}
      </main>
    </>
  )
}
