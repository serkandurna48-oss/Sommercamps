import { computeBrandTokens } from '../brandPipeline'
import CampCreateForm from '../config/CampCreateForm'
import MatchdayBand from '../shell/MatchdayBand'
import { orgTabs } from '../navTabs'
import type { OrganizationIdentityProps } from './types'

export default function CampCreateScreen({ orgSlug, org }: OrganizationIdentityProps) {

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Neues Camp"
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          Camp anlegen
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          Lege dein Camp als Entwurf an. Ergänze danach Ort und Ablauf in den Camp-Einstellungen.
        </p>

        <CampCreateForm orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
