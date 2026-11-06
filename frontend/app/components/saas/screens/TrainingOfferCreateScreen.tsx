import { hasModule } from '../../../lib/orgModules'
import PageHeader from '../shell/PageHeader'
import { ButtonLink } from '../ui/Button'
import { PAGE_FORM } from '../ui/pageLayout'
import OfferForm from '../training/OfferForm'
import type { OrganizationIdentityProps } from './types'

export default function TrainingOfferCreateScreen({ orgSlug, org }: OrganizationIdentityProps) {
  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/trainings`}
        backLabel="Alle Trainings"
        title="Neues Trainingsangebot"
        subtitle="Startet als Entwurf. Termine fügen Sie danach hinzu; öffentlich sichtbar erst nach dem Veröffentlichen."
      />
      <main className={PAGE_FORM}>
        <h2 className="sr-only">Angebot anlegen</h2>
        <OfferForm orgSlug={orgSlug} memberPrice={hasModule(org, 'members')}
          backButton={<ButtonLink href={`/pilot/${orgSlug}/trainings`}>Abbrechen</ButtonLink>} />
      </main>
    </>
  )
}
