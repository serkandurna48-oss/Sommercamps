import { computeBrandTokens } from '../brandPipeline'
import CampCreateForm from '../config/CampCreateForm'
import MatchdayBand from '../shell/MatchdayBand'
import { orgTabs } from '../navTabs'
import type { OrganizationIdentityProps } from './types'
import { DUPLICATE_MISSING, type CampDuplicate } from '../config/campDuplicate'
import { PAGE_FORM } from '../ui/pageLayout'

export default function CampCreateScreen({ orgSlug, org, initialValues, sourceMissing = false }: OrganizationIdentityProps & { initialValues?: CampDuplicate; sourceMissing?: boolean }) {

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

      <main className={PAGE_FORM}>
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {initialValues ? 'Camp duplizieren' : 'Camp anlegen'}
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          Tragen Sie die Eckdaten für Ihr neues Camp ein.
        </p>

        {sourceMissing && <p role="status" className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>{DUPLICATE_MISSING}</p>}
        <CampCreateForm key={initialValues?.slug ?? 'new'} orgSlug={orgSlug} initialValues={initialValues} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
