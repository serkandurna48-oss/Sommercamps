import CampCreateForm from '../config/CampCreateForm'
import PageHeader from '../shell/PageHeader'
import type { OrganizationIdentityProps } from './types'
import { DUPLICATE_MISSING, type CampDuplicate } from '../config/campDuplicate'
import { PAGE_FORM } from '../ui/pageLayout'

export default function CampCreateScreen({ orgSlug, initialValues, sourceMissing = false }: OrganizationIdentityProps & { initialValues?: CampDuplicate; sourceMissing?: boolean }) {

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

        {sourceMissing && <p role="status" className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>{DUPLICATE_MISSING}</p>}
        <CampCreateForm key={initialValues?.slug ?? 'new'} orgSlug={orgSlug} initialValues={initialValues} />
      </main>
    </>
  )
}
