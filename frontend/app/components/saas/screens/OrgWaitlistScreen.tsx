import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import RegistrationActionFeedback from '../ui/RegistrationActionFeedback'
import WaitlistCard from '../data/WaitlistCard'
import WaitlistExportBar from '../data/WaitlistExportBar'
import EmptyState from '../state/EmptyState'
import { orgTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'
import type { WaitlistExportRow } from '../waitlistExport'
import type { OrganizationScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function OrgWaitlistScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {

  const brand = computeBrandTokens(org.primary_color)
  const groups = camps
    .map((camp, i) => ({
      camp,
      registeredCount: registrationsByCamp[i].filter(r => r.status === 'registered' || r.status === 'confirmed').length,
      waitlisted: registrationsByCamp[i].filter(r => r.status === 'waitlist'),
    }))
    .filter(g => g.waitlisted.length > 0)
  const totalWaiting = groups.reduce((sum, g) => sum + g.waitlisted.length, 0)

  const exportRows: WaitlistExportRow[] = groups.flatMap(g =>
    g.waitlisted.map((registration, i) => ({ camp: g.camp, position: i + 1, registration })),
  )

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.command.waitlist}
        subtitle={de.waitlistPage.subtitleOrg}
        metrics={[{ label: de.command.waitlist, value: String(totalWaiting) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE_READING}>

        <RegistrationActionFeedback registrations={groups.flatMap(g => g.waitlisted)} waitlistHref={`/pilot/${orgSlug}/warteliste`}>
          {groups.length === 0 ? (
            <EmptyState title={de.waitlistPage.emptyOrg} />
          ) : (
            <div className="flex flex-col gap-4">
              <WaitlistExportBar
                rows={exportRows}
                showCampTitle
                csvFilename={`${orgSlug}-warteliste.csv`}
                xlsxHref={`/pilot/${orgSlug}/export?view=waitlist`}
              />
              {groups.map(g => (
                <WaitlistCard
                  key={g.camp.slug}
                  orgSlug={orgSlug}
                  campSlug={g.camp.slug}
                  campTitle={g.camp.title}
                  campDate={formatDateRange(g.camp.start_date, g.camp.end_date)}
                  capacity={g.camp.capacity}
                  registeredCount={g.registeredCount}
                  priceCents={g.camp.price_cents}
                  currency={g.camp.currency}
                  waitlisted={g.waitlisted}
                  showCampTitle
                />
              ))}
            </div>
          )}
        </RegistrationActionFeedback>
      </main>
    </>
  )
}
