import { hasModule } from '../../../lib/orgModules'
import PageHeader from '../shell/PageHeader'
import StatusChip, { type StatusTone } from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import { ButtonLink } from '../ui/Button'
import { ADMIN_PAGE } from '../ui/pageLayout'
import ShareActions from '../training/ShareActions'
import { offerKindLabel, offerStatusLabel } from '../training/trainingLogic'
import { formatEuro } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'
import type { TrainingOffer } from '../../../lib/saasAdminApi'
import Link from '../preview/AdminLink'
import { IconPlus } from '../icons'

const STATUS_TONE: Record<TrainingOffer['status'], StatusTone> = { draft: 'neutral', published: 'ok', archived: 'neutral' }

export default function TrainingsScreen({ orgSlug, org, offers }: OrganizationIdentityProps & { offers: TrainingOffer[] }) {
  const published = offers.filter(offer => offer.status === 'published').length

  return (
    <>
      <PageHeader
        title="Trainings"
        subtitle="Einzel- und Gruppentrainings mit festen Terminen. Eltern buchen über einen Link."
        action={<ButtonLink href={`/pilot/${orgSlug}/trainings/new`} variant="primary"><IconPlus size={16} />Angebot anlegen</ButtonLink>}
        metrics={[{ label: 'Angebote', value: String(offers.length) }, { label: 'Veröffentlicht', value: String(published) }]}
      />

      <main className={ADMIN_PAGE}>
        <h2 className="sr-only">Trainingsangebote</h2>
        {offers.length === 0 ? (
          <EmptyState title="Noch kein Trainingsangebot." body="Leg ein Angebot an, füge Termine hinzu und teile den Link." />
        ) : (
          <ul className="cp-card cp-card-list cp-table cp-table-wide">
            <li className="cp-table-head cp-offer-cols" aria-hidden="true">
              <span>Angebot</span><span>Preise</span><span>Status</span><span>Teilen</span><span />
            </li>
            {offers.map(offer => (
              <li key={offer.id} className="cp-table-row cp-offer-cols">
                <div className="min-w-0">
                  <h3 className="cp-subheading break-words">
                    <Link href={`/pilot/${orgSlug}/trainings/${offer.id}`} className="cp-focus underline" style={{ color: 'var(--cp-ink)' }}>{offer.title}</Link>
                  </h3>
                  <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                    {offerKindLabel[offer.kind]} · {offer.duration_minutes} Min.{offer.location ? ` · ${offer.location}` : ''}
                  </p>
                </div>
                <p className="cp-chip cp-num" style={{ color: 'var(--cp-ink-2)' }}>
                  {hasModule(org, 'members')
                    ? <>Mitglieder {formatEuro(offer.price_member_cents)}<br className="max-lg:hidden" /><span className="lg:hidden"> · </span>Nichtmitglieder {formatEuro(offer.price_nonmember_cents)}</>
                    : formatEuro(offer.price_nonmember_cents)}
                </p>
                <div><StatusChip tone={STATUS_TONE[offer.status]} label={offerStatusLabel[offer.status]} /></div>
                <ShareActions orgSlug={orgSlug} offerSlug={offer.slug} title={offer.title} published={offer.status === 'published'} />
                <ButtonLink href={`/pilot/${orgSlug}/trainings/${offer.id}`}>Termine und Buchungen</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
