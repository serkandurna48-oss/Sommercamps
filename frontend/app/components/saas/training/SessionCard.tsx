import type { RegistrationAdmin, TrainingSessionAdmin } from '../../../lib/saasAdminApi'
import { cancelSessionAction, deleteSessionAction } from '../actions/trainingActions'
import StatusChip, { type StatusTone } from '../data/StatusChip'
import ActionForm from '../ui/ActionForm'
import BookingRow from './BookingRow'
import { formatSessionWhen } from './trainingLogic'

const SESSION_STATUS: Record<TrainingSessionAdmin['status'], { label: string; tone: StatusTone }> = {
  published: { label: 'Buchbar', tone: 'ok' },
  draft: { label: 'Entwurf', tone: 'neutral' },
  closed: { label: 'Geschlossen', tone: 'info' },
  archived: { label: 'Abgesagt', tone: 'neutral' },
}

/** Ein Termin mit Belegung, Aktionen und seinen Buchungen. Zeit aus
 * local_date/local_time (Berlin), nicht aus UTC. */
export default function SessionCard({ orgSlug, offerId, session, registrations, brandStrong, brandOn }: {
  orgSlug: string
  offerId: string
  session: TrainingSessionAdmin
  registrations: RegistrationAdmin[]
  brandStrong: string
  brandOn: string
}) {
  const status = SESSION_STATUS[session.status] ?? { label: session.status, tone: 'neutral' as const }
  const neverBooked = registrations.length === 0
  const canCancel = session.status !== 'archived' && session.booked_count === 0
  const remove = deleteSessionAction.bind(null, orgSlug, offerId, session.id)
  const cancel = cancelSessionAction.bind(null, orgSlug, offerId, session.id)

  return (
    <li className="cp-card flex flex-col gap-3" data-session-id={session.id}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{formatSessionWhen(session.local_date, session.local_time)}</p>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            {session.booked_count} von {session.capacity} {session.capacity === 1 ? 'Platz' : 'Plätzen'} belegt
            {session.free_spots === 0 ? ' · ausgebucht' : ` · ${session.free_spots} frei`} · {session.age_min}–{session.age_max} Jahre
          </p>
        </div>
        <StatusChip tone={status.tone} label={status.label} />
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {canCancel && (
          <ActionForm action={cancel} label="Termin absagen" pendingLabel="Wird abgesagt …"
            requireConfirm="Termin absagen? Er ist danach nicht mehr buchbar und nicht mehr öffentlich sichtbar." />
        )}
        {neverBooked && (
          <ActionForm action={remove} label="Termin löschen" pendingLabel="Wird gelöscht …" variant="danger"
            requireConfirm="Termin endgültig löschen?" />
        )}
        {session.booked_count > 0 && (
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Zum Absagen zuerst die Buchungen stornieren.</p>
        )}
      </div>

      {registrations.length > 0 && (
        <details className="rounded-[var(--cp-r-field)] border" style={{ borderColor: 'var(--cp-line-2)' }}>
          <summary className="cp-focus cp-subheading min-h-[44px] cursor-pointer px-4 py-3">Buchungen ({registrations.length})</summary>
          <ul>
            {registrations.map(registration => (
              <BookingRow key={registration.id} orgSlug={orgSlug} sessionSlug={session.slug} sessionId={session.id} registration={registration} brandStrong={brandStrong} brandOn={brandOn} />
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}
