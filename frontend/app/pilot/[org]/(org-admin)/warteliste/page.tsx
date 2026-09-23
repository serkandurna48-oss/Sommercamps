import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import WaitlistCard from '../../../../components/saas/data/WaitlistCard'
import WaitlistExportBar from '../../../../components/saas/data/WaitlistExportBar'
import EmptyState from '../../../../components/saas/state/EmptyState'
import { orgTabs } from '../../../../components/saas/navTabs'
import { de } from '../../../../lib/i18n/de'
import type { WaitlistExportRow } from '../../../../components/saas/waitlistExport'

export default async function OrgWaitlistPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  const brand = computeBrandTokens(org.primary_color)
  const groups = camps
    .map((camp, i) => ({ camp, waitlisted: registrationsByCamp[i].filter(r => r.status === 'waitlist') }))
    .filter(g => g.waitlisted.length > 0)
  const totalWaiting = groups.reduce((sum, g) => sum + g.waitlisted.length, 0)

  const exportRows: WaitlistExportRow[] = groups.flatMap(g =>
    g.waitlisted.map((registration, i) => ({ camp: g.camp, position: i + 1, registration })),
  )

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={org.name}
        metrics={[{ label: de.command.waitlist, value: String(totalWaiting) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.waitlistPage.heading}
        </h2>
        <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
          {de.waitlistPage.subtitleOrg}
        </p>

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
                waitlisted={g.waitlisted}
                brandColor={brand.brand}
                brandStrong={brand.brandStrong}
                brandOn={brand.brandOn}
                showCampTitle
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
