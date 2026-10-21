import EmptyCampScreen from './EmptyCampScreen'
import { computeBrandTokens } from '../brandPipeline'
import CampConfigForm from '../config/CampConfigForm'
import MatchdayBand from '../shell/MatchdayBand'
import { campTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'
import SuccessNote from '../state/SuccessNote'
import type { CampScreenProps } from './types'

export default function CampConfigScreen({ orgSlug, campSlug, org, camp, created = false }: Omit<CampScreenProps, 'registrations'> & { created?: boolean }) {
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

        {created && <div className="mb-6"><SuccessNote>Camp angelegt – ergänze jetzt Ort und Ablauf</SuccessNote></div>}
        <CampConfigForm orgSlug={orgSlug} org={{ site_published: org.site_published, contact_email: org.contact_email, iban: org.iban, terms_text: org.terms_text }} camp={camp} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
