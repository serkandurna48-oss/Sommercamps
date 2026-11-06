import PageHeader from '../shell/PageHeader'
import RegistrationActionFeedback from '../ui/RegistrationActionFeedback'
import WaitlistCard from '../data/WaitlistCard'
import WaitlistExportBar from '../data/WaitlistExportBar'
import EmptyState from '../state/EmptyState'
import { campHeader } from './campHeader'
import { de, formatDateRange } from '../../../lib/i18n/de'
import type { WaitlistExportRow } from '../waitlistExport'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function CampWaitlistScreen({ orgSlug, campSlug, org, camp, registrations }: CampScreenProps) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const waitlisted = registrations.filter(r => r.status === 'waitlist')
  const exportRows: WaitlistExportRow[] = waitlisted.map((registration, i) => ({ camp, position: i + 1, registration }))

  return (
    <>
      <PageHeader {...campHeader(orgSlug, campSlug, camp, registrations)} />

      <main className={PAGE_READING}>
        <h2 className="sr-only">{de.waitlistPage.heading}</h2>

        <RegistrationActionFeedback registrations={waitlisted} waitlistHref={`/pilot/${orgSlug}/camps/${campSlug}/warteliste`}>
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
                campDate={formatDateRange(camp.start_date, camp.end_date)}
                capacity={camp.capacity}
                registeredCount={registrations.filter(r => r.status === 'registered' || r.status === 'confirmed').length}
                priceCents={camp.price_cents}
                currency={camp.currency}
                waitlisted={waitlisted}
              />
            </>
          )}
        </RegistrationActionFeedback>
      </main>
    </>
  )
}
