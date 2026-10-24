import EmptyCampScreen from './EmptyCampScreen'
import { computeBrandTokens } from '../brandPipeline'
import CampConfigForm from '../config/CampConfigForm'
import MatchdayBand from '../shell/MatchdayBand'
import { campTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'
import SuccessNote from '../state/SuccessNote'
import type { CampScreenProps } from './types'
import { DUPLICATE_SUCCESS } from '../config/campDuplicate'

export default function CampConfigScreen({ orgSlug, campSlug, org, camp, created = false, duplicate }: Omit<CampScreenProps, 'registrations'> & { created?: boolean; duplicate?: '1' | 'incomplete' }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/camps/${campSlug}`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Camp-Einstellungen"
        subtitle={`${camp.title} · ${formatDateRange(camp.start_date, camp.end_date)}`}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          Camp-Einstellungen
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          {de.configPage.campHint}
        </p>

        {duplicate === '1' && <div className="mb-6"><SuccessNote>{DUPLICATE_SUCCESS}</SuccessNote></div>}
        {duplicate === 'incomplete' && <p role="alert" className="cp-body mb-6" style={{ color: 'var(--cp-error)' }}>Der Entwurf wurde angelegt, aber die weiteren Angaben konnten nicht übernommen werden. Bitte ergänzen Sie Ort, Betreuung, Verpflegung, Leistungen, Währung und Anmeldezeitraum vor der Veröffentlichung.</p>}
        {created && !duplicate && <div className="mb-6"><SuccessNote>Camp angelegt – ergänzen Sie jetzt Ort und Ablauf</SuccessNote></div>}
        <CampConfigForm orgSlug={orgSlug} org={{ site_published: org.site_published, contact_email: org.contact_email, iban: org.iban, terms_text: org.terms_text }} camp={camp} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
