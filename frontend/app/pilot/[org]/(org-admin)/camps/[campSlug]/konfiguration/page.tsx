import { computeBrandTokens } from '../../../../../../components/saas/brandPipeline'
import CampConfigForm from '../../../../../../components/saas/config/CampConfigForm'
import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../../../components/saas/shell/MatchdayBand'
import { campTabs } from '../../../../../../components/saas/navTabs'
import { de, formatDateRange } from '../../../../../../lib/i18n/de'

export default async function CampConfigPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp } = await loadCampAdminData(orgSlug, campSlug)

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        subtitle={formatDateRange(camp.start_date, camp.end_date)}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.campHeading}
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          {de.configPage.campHint}
        </p>

        <CampConfigForm orgSlug={orgSlug} camp={camp} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
