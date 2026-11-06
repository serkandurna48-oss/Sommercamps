import { berlinDay, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import { hasModule } from '../../../lib/orgModules'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import GoalsSection from '../player/GoalsSection'
import MeasurementsSection from '../player/MeasurementsSection'
import NotesTimeline from '../player/NotesTimeline'
import { NoteComposerProvider, WriteNoteButton } from '../player/NoteComposer'
import { DISCLOSURE_SUMMARY } from '../player/compact'
import { ageFromBirthDate, formatDay, hasDocumentationConsent, lastTrainingDate, parseQuickPrefill } from '../player/playerLogic'
import type { OrganizationIdentityProps } from './types'
import type { PlayerDetail } from '../../../lib/saasAdminApi'

export const NO_CONSENT_HINT = 'Keine Einwilligung zur Doku vorhanden – bitte bei den Eltern nachfragen'

export default function PlayerRecordScreen({ orgSlug, org, record, query, today = berlinDay(new Date()) }: OrganizationIdentityProps & {
  record: PlayerDetail
  /** searchParams der Seite: `neu=1&termin=<Termin-Id>` öffnet die Schnellerfassung vorbelegt. */
  query?: Record<string, unknown>
  today?: string
}) {
  const { player, bookings, notes, goals, measurements, metrics } = record
  const age = ageFromBirthDate(player.birth_date, today) ?? player.age
  const prefill = parseQuickPrefill(query, bookings, today)
  const bookingCount = bookings.filter(booking => booking.status !== 'cancelled').length
  const lastTraining = lastTrainingDate(bookings, today)
  const consent = hasDocumentationConsent(bookings)

  return (
    <NoteComposerProvider initialOpen={prefill.open}>
      <PageHeader
        backHref={`/pilot/${orgSlug}/spieler`}
        backLabel="Alle Spieler"
        title={`${player.first_name} ${player.last_name}`}
        subtitle={<>{`${age} Jahre · geboren ${formatDay(player.birth_date)}`}{hasModule(org, 'members') && player.is_member && <>{' '}<StatusChip tone="ok" label="Mitglied" /></>}</>}
        metrics={[
          { label: 'Buchungen', value: String(bookingCount) },
          { label: 'Letztes Training', value: lastTraining ? formatDay(lastTraining) : '–' },
          { label: 'Notizen', value: String(notes.length) },
        ]}
        action={<WriteNoteButton />}
      />

      <main className={ADMIN_PAGE}>
        {!consent && (
          <p className="cp-body mb-5 rounded-[var(--cp-r-chip)] border px-4 py-3" role="note" data-consent-hint
            style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
            {NO_CONSENT_HINT}
          </p>
        )}

        {/* Reihenfolge im DOM = Reihenfolge am Handy (Ziele, Messwerte, Notizen, Buchungen); ab 1024 px steht der Block „Ziele/Messwerte“ rechts und bleibt beim Scrollen stehen. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:-m-1 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:p-1" data-pinned
            role="region" aria-label="Ziele und Messwerte">
            <GoalsSection orgSlug={orgSlug} playerId={player.id} goals={goals} />
            <MeasurementsSection orgSlug={orgSlug} playerId={player.id} measurements={measurements} metrics={metrics} today={today} />
          </div>

          <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
            <NotesTimeline orgSlug={orgSlug} playerId={player.id} notes={notes} bookings={bookings}
              initialDate={prefill.date} initialCampId={prefill.campId} />

            <section className="flex flex-col gap-2" aria-labelledby="bookings-heading">
              <h2 id="bookings-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
                Buchungen <span className="cp-chip align-middle" style={{ color: 'var(--cp-muted)' }}>{bookings.length}</span>
              </h2>
              {bookings.length === 0 ? (
                <EmptyState title="Noch keine Buchungen." />
              ) : (
                <details className="group cp-card [--cp-card-padding:4px_16px]">
                  <summary className={`${DISCLOSURE_SUMMARY} w-full`} style={{ color: 'var(--cp-ink-2)' }}>
                    Alle {bookings.length} Buchungen anzeigen
                  </summary>
                  <ul>
                    {bookings.map(booking => (
                      <li key={booking.registration_id} className="flex flex-col gap-1.5 border-t py-2.5 sm:flex-row sm:items-center sm:justify-between" style={{ borderTopColor: 'var(--cp-line-2)' }}>
                        <div className="min-w-0">
                          <p className="cp-label break-words" style={{ color: 'var(--cp-ink)' }}>{booking.offer_title ?? booking.camp_title}</p>
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
                </details>
              )}
            </section>
          </div>
        </div>
      </main>
    </NoteComposerProvider>
  )
}
