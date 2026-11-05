import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import StatusChip from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import SuccessNote from '../state/SuccessNote'
import { PAGE } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import OfferForm from '../training/OfferForm'
import SessionCard from '../training/SessionCard'
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
  const brand = computeBrandTokens(org.primary_color)
  const sorted = [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const booked = sorted.reduce((sum, session) => sum + session.booked_count, 0)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/trainings`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={offer.title}
        subtitle={`${offerKindLabel[offer.kind]} · ${offerStatusLabel[offer.status]}`}
        metrics={[{ label: 'Termine', value: String(sessions.length) }, { label: 'Buchungen', value: String(booked) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE}>
        {justCreated && <div className="mb-6"><SuccessNote>Angebot angelegt. Fügen Sie jetzt Termine hinzu.</SuccessNote></div>}

        <section className="mb-10 flex flex-col gap-3" aria-labelledby="share-heading">
          <h2 id="share-heading" className="cp-title" style={{ color: 'var(--cp-ink)' }}>Teilen</h2>
          <ShareActions orgSlug={orgSlug} offerSlug={offer.slug} title={offer.title} published={offer.status === 'published'} />
        </section>

        <section className="mb-10 flex flex-col gap-4" aria-labelledby="sessions-heading">
          <div className="flex items-center gap-3">
            <h2 id="sessions-heading" className="cp-title" style={{ color: 'var(--cp-ink)' }}>Termine</h2>
            <StatusChip tone="neutral" label={`${sessions.length}`} />
          </div>
          <div className="max-w-[640px]">
            <SessionForm orgSlug={orgSlug} offerId={offer.id} kind={offer.kind} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
          </div>
          {sorted.length === 0 ? (
            <EmptyState title="Noch keine Termine." body="Legen Sie oben den ersten Termin an. Zeiten gelten in Berliner Zeit." />
          ) : (
            <ul className="flex flex-col gap-4">
              {sorted.map(session => (
                <SessionCard key={session.id} orgSlug={orgSlug} offerId={offer.id} session={session}
                  registrations={registrationsBySession[session.id] ?? []} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
              ))}
            </ul>
          )}
        </section>

        <section className="max-w-[640px]" aria-labelledby="edit-heading">
          <h2 id="edit-heading" className="cp-title mb-4" style={{ color: 'var(--cp-ink)' }}>Angebot bearbeiten</h2>
          <OfferForm orgSlug={orgSlug} offer={offer} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
        </section>
      </main>
    </>
  )
}
