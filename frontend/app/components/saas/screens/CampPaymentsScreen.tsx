import { isOpenPayment } from '../commandCenterLogic'
import PageHeader from '../shell/PageHeader'
import PaymentSection, { type PaymentEntry } from '../data/PaymentSection'
import { campHeader } from './campHeader'
import { de } from '../../../lib/i18n/de'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'
import { ADMIN_PAGE } from '../ui/pageLayout'

export default function CampPaymentsScreen({ orgSlug, campSlug, org, camp, registrations, initialFilter = 'open' }: CampScreenProps & { initialFilter?: 'open' | 'paid' | 'all' }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />
  const entries: PaymentEntry[] = registrations.map(registration => ({ registration, camp }))
  const openCount = entries.filter(e => isOpenPayment(e.registration)).length

  return (
    <>
      <PageHeader {...campHeader(orgSlug, campSlug, camp, registrations)} />

      <main className={ADMIN_PAGE}>
        <p className="cp-hint mb-4">{openCount === 1 ? '1 Zahlung offen' : `${openCount} Zahlungen offen`} · Beträge berechnet aus den aktuellen Anmeldungen und dem Campreis.</p>

        <PaymentSection
          org={{ name: org.name, legal_name: org.legal_name, iban: org.iban, contact_person_name: org.contact_person_name, contact_email: org.contact_email }}
          key={`${campSlug}-${initialFilter}`}
          initialFilter={initialFilter}
          entries={entries}
          orgSlug={orgSlug}
          emptyLabel={de.paymentsPage.emptyCamp}
          csvFilename={`${campSlug}-zahlungen.csv`}
          xlsxHref={`/pilot/${orgSlug}/camps/${campSlug}/export?view=payments`}
        />
      </main>
    </>
  )
}
