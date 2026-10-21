import { computeBrandTokens } from '../brandPipeline'
import OrganizationConfigForm from '../config/OrganizationConfigForm'
import MatchdayBand from '../shell/MatchdayBand'
import { orgTabs } from '../navTabs'
import { de } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'

export default function OrgConfigScreen({ orgSlug, org }: OrganizationIdentityProps) {

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Vereinseinstellungen"
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.orgHeading}
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          {de.configPage.orgHint}
        </p>

        <OrganizationConfigForm orgSlug={orgSlug} org={org} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
