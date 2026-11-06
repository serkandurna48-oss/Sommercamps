import EmptyCampScreen from './EmptyCampScreen'
import CampConfigForm from '../config/CampConfigForm'
import PageHeader from '../shell/PageHeader'
import { campHeader } from './campHeader'
import { de } from '../../../lib/i18n/de'
import SuccessNote from '../state/SuccessNote'
import type { CampScreenProps } from './types'
import { DUPLICATE_SUCCESS } from '../config/campDuplicate'
import { ButtonLink } from '../ui/Button'
import { PAGE_FORM } from '../ui/pageLayout'

export default function CampConfigScreen({ orgSlug, campSlug, org, camp, created = false, duplicate }: Omit<CampScreenProps, 'registrations'> & { created?: boolean; duplicate?: '1' | 'incomplete' }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  return (
    <>
      <PageHeader {...campHeader(orgSlug, campSlug, camp)} />

      <main className={PAGE_FORM}>
        <h2 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Camp-Einstellungen</h2>
        <p className="cp-hint mt-1 mb-6">{de.configPage.campHint}</p>

        {duplicate === '1' && <div className="mb-6"><SuccessNote>{DUPLICATE_SUCCESS}</SuccessNote></div>}
        {duplicate === 'incomplete' && <p role="alert" className="cp-body mb-6" style={{ color: 'var(--cp-error)' }}>Der Entwurf wurde angelegt, aber die weiteren Angaben konnten nicht übernommen werden. Bitte ergänzen Sie Ort, Betreuung, Verpflegung, Leistungen, Währung und Anmeldezeitraum vor der Veröffentlichung.</p>}
        {created && !duplicate && <div className="mb-6"><SuccessNote>Camp angelegt – ergänzen Sie jetzt Ort und Ablauf</SuccessNote></div>}
        <CampConfigForm orgSlug={orgSlug} org={{ site_published: org.site_published, contact_email: org.contact_email, iban: org.iban, terms_text: org.terms_text }} camp={camp} />
        {org.review_status && org.review_status !== 'approved' && (
          <div className="mt-6 flex flex-col items-start gap-3">
            <p className="cp-body">{de.einrichtung.continueSetupHint}</p>
            <ButtonLink href={`/pilot/${orgSlug}/einrichtung?schritt=4`} variant="secondary">
              {de.einrichtung.continueSetup}
            </ButtonLink>
          </div>
        )}
      </main>
    </>
  )
}
