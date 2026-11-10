import CampCreateForm from '../config/CampCreateForm'
import PageHeader from '../shell/PageHeader'
import type { OrganizationIdentityProps } from './types'
import { DUPLICATE_MISSING, type CampDuplicate } from '../config/campDuplicate'
import { PAGE_FORM } from '../ui/pageLayout'

/** Im Paket Starter ist ein aktives Camp enthalten; das Formular legt immer einen Entwurf an. */
export const STARTER_CAMP_HINT = 'Im Paket Starter ist 1 aktives Camp enthalten. Du kannst das Camp als Entwurf anlegen; veröffentlichen geht nach dem Wechsel ins Paket Verein.'

export default function CampCreateScreen({ orgSlug, org, initialValues, sourceMissing = false }: OrganizationIdentityProps & { initialValues?: CampDuplicate; sourceMissing?: boolean }) {

  const showStarterHint = org?.plan === 'starter' && (org.active_camps ?? 0) >= 1

  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/camps`}
        backLabel="Alle Camps"
        title={initialValues ? 'Camp duplizieren' : 'Neues Camp'}
        subtitle="Trag die Eckdaten für dein neues Camp ein."
      />

      <main className={PAGE_FORM}>
        <h2 className="sr-only">{initialValues ? 'Camp duplizieren' : 'Camp anlegen'}</h2>

        {showStarterHint && <p role="note" className="cp-body mb-6 rounded-[var(--cp-r-chip)] border px-3 py-2" style={{ color: 'var(--cp-ink-2)', borderColor: 'var(--cp-line)' }}>{STARTER_CAMP_HINT}</p>}
        {sourceMissing && <p role="status" className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>{DUPLICATE_MISSING}</p>}
        <CampCreateForm key={initialValues?.slug ?? 'new'} orgSlug={orgSlug} initialValues={initialValues} />
      </main>
    </>
  )
}
