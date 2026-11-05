import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import StatusChip, { type StatusTone } from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import { ButtonLink } from '../ui/Button'
import { PAGE } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import ShareActions from '../training/ShareActions'
import { offerKindLabel, offerStatusLabel } from '../training/trainingLogic'
import { formatEuro } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'
import type { TrainingOffer } from '../../../lib/saasAdminApi'
import Link from '../preview/AdminLink'

const STATUS_TONE: Record<TrainingOffer['status'], StatusTone> = { draft: 'neutral', published: 'ok', archived: 'neutral' }

export default function TrainingsScreen({ orgSlug, org, offers }: OrganizationIdentityProps & { offers: TrainingOffer[] }) {
  const brand = computeBrandTokens(org.primary_color)
  const published = offers.filter(offer => offer.status === 'published').length

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Trainings"
        metrics={[{ label: 'Angebote', value: String(offers.length) }, { label: 'Veröffentlicht', value: String(published) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Trainingsangebote</h2>
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Einzel- und Gruppentrainings mit festen Terminen. Eltern buchen über einen Link.</p>
          </div>
          <ButtonLink href={`/pilot/${orgSlug}/trainings/new`} variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}>
            Angebot anlegen
          </ButtonLink>
        </div>

        {offers.length === 0 ? (
          <EmptyState title="Noch kein Trainingsangebot." body="Legen Sie ein Angebot an, fügen Sie Termine hinzu und teilen Sie den Link." />
        ) : (
          <ul className="flex flex-col gap-4">
            {offers.map(offer => (
              <li key={offer.id} className="cp-card flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="cp-subheading break-words">
                      <Link href={`/pilot/${orgSlug}/trainings/${offer.id}`} className="cp-focus underline" style={{ color: 'var(--cp-ink)' }}>{offer.title}</Link>
                    </h3>
                    <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                      {offerKindLabel[offer.kind]} · {offer.duration_minutes} Min.{offer.location ? ` · ${offer.location}` : ''}
                    </p>
                    <p className="cp-chip" style={{ color: 'var(--cp-ink-2)' }}>
                      Mitglieder {formatEuro(offer.price_member_cents)} · Nichtmitglieder {formatEuro(offer.price_nonmember_cents)}
                    </p>
                  </div>
                  <StatusChip tone={STATUS_TONE[offer.status]} label={offerStatusLabel[offer.status]} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <ShareActions orgSlug={orgSlug} offerSlug={offer.slug} title={offer.title} published={offer.status === 'published'} />
                  <ButtonLink href={`/pilot/${orgSlug}/trainings/${offer.id}`}>Termine und Buchungen</ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
