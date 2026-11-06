import { berlinDay, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import GoalsSection from '../player/GoalsSection'
import MeasurementsSection from '../player/MeasurementsSection'
import NotesTimeline from '../player/NotesTimeline'
import QuickNoteForm from '../player/QuickNoteForm'
import { ageFromBirthDate, formatDay, hasDocumentationConsent, parseQuickPrefill } from '../player/playerLogic'
import type { OrganizationIdentityProps } from './types'
import type { PlayerDetail } from '../../../lib/saasAdminApi'

export const NO_CONSENT_HINT = 'Keine Einwilligung zur Doku vorhanden – bitte bei den Eltern nachfragen'

export default function PlayerRecordScreen({ orgSlug, record, query, today = berlinDay(new Date()) }: OrganizationIdentityProps & {
  record: PlayerDetail
  /** searchParams der Seite: `neu=1&termin=<Termin-Id>` öffnet die Schnellerfassung vorbelegt. */
  query?: Record<string, unknown>
  today?: string
}) {
  const { player, bookings, notes, goals, measurements, metrics } = record
  const age = ageFromBirthDate(player.birth_date, today) ?? player.age
  const prefill = parseQuickPrefill(query, bookings, today)
  const openGoals = goals.filter(goal => goal.status === 'offen').length
  const consent = hasDocumentationConsent(bookings)

  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/spieler`}
        backLabel="Alle Spieler"
        title={`${player.first_name} ${player.last_name}`}
        subtitle={`${age} Jahre · geboren ${formatDay(player.birth_date)}`}
        metrics={[{ label: 'Notizen', value: String(notes.length) }, { label: 'Offene Ziele', value: String(openGoals) }]}
      />

      <main className={ADMIN_PAGE}>
        {!consent && (
          <p className="cp-body mb-6 rounded-[var(--cp-r-chip)] border px-4 py-3" role="note" data-consent-hint
            style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
            {NO_CONSENT_HINT}
          </p>
        )}

        <section className="mb-8 flex flex-col gap-3" aria-labelledby="new-note-heading">
          <h2 id="new-note-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Neue Notiz</h2>
          <div>
            <QuickNoteForm orgSlug={orgSlug} playerId={player.id} bookings={bookings} initialDate={prefill.date}
              initialCampId={prefill.campId} autoFocus={prefill.open} />
          </div>
        </section>

        <div className="cp-split">
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Notizen</h2>
          <div>
            <NotesTimeline orgSlug={orgSlug} playerId={player.id} notes={notes} bookings={bookings} />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-8">
        <section className="flex flex-col gap-3" aria-labelledby="goals-heading">
          <h2 id="goals-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Ziele</h2>
          <div>
            <GoalsSection orgSlug={orgSlug} playerId={player.id} goals={goals} />
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="measurements-heading">
          <h2 id="measurements-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Messwerte</h2>
          <div>
            <MeasurementsSection orgSlug={orgSlug} playerId={player.id} measurements={measurements} metrics={metrics} today={today} />
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="bookings-heading">
          <h2 id="bookings-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Buchungen</h2>
          {bookings.length === 0 ? (
            <EmptyState title="Noch keine Buchungen." />
          ) : (
            <ul className="cp-card cp-card-list">
              {bookings.map(booking => (
                <li key={booking.registration_id} className="flex flex-col gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderTopColor: 'var(--cp-line-2)' }}>
                  <div className="min-w-0">
                    <p className="cp-subheading break-words" style={{ color: 'var(--cp-ink)' }}>{booking.offer_title ?? booking.camp_title}</p>
                    <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                      {formatDay(booking.local_date)}{booking.local_time ? `, ${booking.local_time} Uhr` : ''} · {booking.kind === 'camp' ? 'Camp' : 'Training'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={PAYMENT_STATUS_TONE[booking.payment_status] ?? 'neutral'} label={paymentStatusLabel[booking.payment_status] ?? booking.payment_status} />
                    {booking.status !== 'confirmed' && booking.status !== 'registered' && (
                      <StatusChip tone={REGISTRATION_STATUS_TONE[booking.status] ?? 'neutral'} label={registrationStatusLabel[booking.status] ?? booking.status} dot />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
        </div>
      </main>
    </>
  )
}
