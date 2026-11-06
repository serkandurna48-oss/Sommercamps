import { deletePlayerRecordAction } from '../actions/playerActions'
import ActionForm from '../ui/ActionForm'

/**
 * Deletes the whole player record (notes, goals, measurements) for good, e.g. on a parent's
 * request. Blocked while a booking is still active; the backend enforces the same rule.
 */
export default function DeletePlayerRecord({ orgSlug, playerId, name, activeBookings, notes, goals, measurements }: {
  orgSlug: string
  playerId: string
  name: string
  activeBookings: number
  notes: number
  goals: number
  measurements: number
}) {
  return (
    <section className="flex flex-col gap-2 border-t pt-5" style={{ borderTopColor: 'var(--cp-line-2)' }} aria-label="Spielerakte löschen">
      {activeBookings > 0 ? (
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }} data-delete-blocked>
          Die Spielerakte kannst du erst löschen, wenn keine Buchung mehr aktiv ist: Storniere oder lösche zuerst die {activeBookings} aktive{activeBookings === 1 ? ' Buchung' : 'n Buchungen'}.
        </p>
      ) : (
        <ActionForm
          action={deletePlayerRecordAction.bind(null, orgSlug, playerId)}
          label="Spielerakte löschen"
          pendingLabel="Wird gelöscht …"
          variant="danger"
          cancelLabel="Behalten"
          requireConfirm={<>
            <p className="cp-subheading">Spielerakte von {name} endgültig löschen?</p>
            <p>Das löscht {notes} Notizen, {goals} Ziele und {measurements} Messwerte. Das lässt sich nicht rückgängig machen.</p>
          </>}
        />
      )}
    </section>
  )
}
