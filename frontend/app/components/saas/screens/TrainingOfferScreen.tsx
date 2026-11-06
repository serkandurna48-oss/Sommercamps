import PageHeader from '../shell/PageHeader'
import StatusChip from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import SuccessNote from '../state/SuccessNote'
import { ADMIN_PAGE } from '../ui/pageLayout'
import OfferForm from '../training/OfferForm'
import SessionCard from '../training/SessionCard'
import { hasModule } from '../../../lib/orgModules'
import SessionForm from '../training/SessionForm'
import ShareActions from '../training/ShareActions'
import { offerKindLabel, offerStatusLabel } from '../training/trainingLogic'
import type { OrganizationIdentityProps } from './types'
import type { RegistrationAdmin, TrainingOffer, TrainingSessionAdmin } from '../../../lib/saasAdminApi'

export default function TrainingOfferScreen({ orgSlug, org, offer, sessions, registrationsBySession, justCreated = false }: OrganizationIdentityProps & {
  offer: TrainingOffer
  sessions: TrainingSessionAdmin[]
  registrationsBySession: Record<string, RegistrationAdmin[]>
  justCreated?: boolean
}) {
  const playerDocs = hasModule(org, 'players')
  const sorted = [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const booked = sorted.reduce((sum, session) => sum + session.booked_count, 0)

  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/trainings`}
        backLabel="Alle Trainings"
        title={offer.title}
        subtitle={`${offerKindLabel[offer.kind]} · ${offerStatusLabel[offer.status]}`}
        metrics={[{ label: 'Termine', value: String(sessions.length) }, { label: 'Buchungen', value: String(booked) }]}
      />

      <main className={ADMIN_PAGE}>
        {justCreated && <div className="mb-6"><SuccessNote>Angebot angelegt. Fügen Sie jetzt Termine hinzu.</SuccessNote></div>}

        <div className="cp-split mb-10">
          <section className="flex min-w-0 flex-col gap-3" aria-labelledby="sessions-heading">
            <div className="flex items-center gap-3">
              <h2 id="sessions-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Termine</h2>
              <StatusChip tone="neutral" label={`${sessions.length}`} />
            </div>
            {sorted.length === 0 ? (
              <EmptyState title="Noch keine Termine." body="Legen Sie rechts den ersten Termin an. Zeiten gelten in Berliner Zeit." />
            ) : (
              <ul className="flex flex-col gap-3">
                {sorted.map(session => (
                  <SessionCard key={session.id} orgSlug={orgSlug} offerId={offer.id} session={session}
                    registrations={registrationsBySession[session.id] ?? []} playerDocs={playerDocs} memberPrices={hasModule(org, 'members')} />
                ))}
              </ul>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <section id="termin-anlegen" className="scroll-mt-20" aria-label="Neuen Termin anlegen">
              <SessionForm orgSlug={orgSlug} offerId={offer.id} kind={offer.kind} />
            </section>
            <section className="cp-card flex flex-col gap-3" aria-labelledby="share-heading">
              <h2 id="share-heading" className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Teilen</h2>
              <ShareActions orgSlug={orgSlug} offerSlug={offer.slug} title={offer.title} published={offer.status === 'published'} />
            </section>
          </div>
        </div>

        <section aria-labelledby="edit-heading">
          <h2 id="edit-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Angebot bearbeiten</h2>
          <OfferForm orgSlug={orgSlug} offer={offer} memberPrice={hasModule(org, 'members')} />
        </section>
      </main>
    </>
  )
}
