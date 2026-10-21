import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import RegistrationActionFeedback from '../ui/RegistrationActionFeedback'
import WaitlistCard from '../data/WaitlistCard'
import WaitlistExportBar from '../data/WaitlistExportBar'
import EmptyState from '../state/EmptyState'
import { campTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'
import type { WaitlistExportRow } from '../waitlistExport'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'

export default function CampWaitlistScreen({ orgSlug, campSlug, org, camp, registrations }: CampScreenProps) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const waitlisted = registrations.filter(r => r.status === 'waitlist')
  const brand = computeBrandTokens(org.primary_color)
  const exportRows: WaitlistExportRow[] = waitlisted.map((registration, i) => ({ camp, position: i + 1, registration }))

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/camps/${campSlug}`}
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
                capacity={camp.capacity}
                registeredCount={registrations.filter(r => r.status === 'registered' || r.status === 'confirmed').length}
                priceCents={camp.price_cents}
                currency={camp.currency}
                waitlisted={waitlisted}
                brandColor={brand.brand}
                brandStrong={brand.brandStrong}
                brandOn={brand.brandOn}
              />
            </>
          )}
        </RegistrationActionFeedback>
      </main>
    </>
  )
}
