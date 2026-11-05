import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import { ButtonLink } from '../ui/Button'
import { PAGE_FORM } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import OfferForm from '../training/OfferForm'
import type { OrganizationIdentityProps } from './types'

export default function TrainingOfferCreateScreen({ orgSlug, org }: OrganizationIdentityProps) {
  const brand = computeBrandTokens(org.primary_color)
  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/trainings`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Neues Trainingsangebot"
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />
      <main className={PAGE_FORM}>
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Angebot anlegen</h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          Das Angebot startet als Entwurf. Termine fügen Sie danach hinzu; öffentlich sichtbar ist es erst, wenn Sie es veröffentlichen.
        </p>
        <OfferForm orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn}
          backButton={<ButtonLink href={`/pilot/${orgSlug}/trainings`}>Abbrechen</ButtonLink>} />
      </main>
    </>
  )
}
