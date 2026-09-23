'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { cancelRegistrationAdmin, promoteWaitlistAdmin } from '../../../lib/saasAdminApi'
import type { ActionFormState } from '../ui/ActionForm'

/**
 * Rückt immer die eine älteste Warteliste-Anmeldung auf (FIFO,
 * server-seitig entschieden — siehe backend_saas
 * promote_next_waitlisted_registration) — nie eine vom Aufrufer gewählte,
 * damit der Button neben Platz 1 nie etwas anderes tut als er zeigt.
 * `promoted: null` ist kein Fehler (kein freier Platz / niemand wartet
 * mehr) — wird trotzdem als `error` zurückgegeben, damit ActionForm es
 * ohne Sonderfall anzeigt.
 */
export async function promoteWaitlistAction(
  orgSlug: string,
  campSlug: string,
  _prev: ActionFormState,
): Promise<ActionFormState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', success: null }

  try {
    const result = await promoteWaitlistAdmin(orgSlug, campSlug, token)
    if (!result.promoted) {
      return { error: 'Kein freier Platz gerade — später erneut versuchen.', success: null }
    }
    revalidatePath(`/pilot/${orgSlug}`, 'layout')
    return { error: null, success: 'Nächste Familie ist jetzt angemeldet.' }
  } catch {
    return { error: 'Konnte nicht aufrücken — erneut versuchen.', success: null }
  }
}

/**
 * Storniert eine registrierte Anmeldung und rückt — falls dadurch ein
 * Platz frei wurde — automatisch die nächste Warteliste-Anmeldung nach
 * (backend_saas cancel_registration_and_promote_next, ein Aufruf, eine
 * Transaktion). Für den Teilnehmer-Detailbereich (ParticipantDetail) —
 * dort existierte bisher absichtlich kein solcher Button, weil es keinen
 * Endpunkt dafür gab.
 */
export async function cancelRegistrationAction(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  _prev: ActionFormState,
): Promise<ActionFormState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', success: null }

  try {
    const result = await cancelRegistrationAdmin(orgSlug, campSlug, registrationToken, token)
    revalidatePath(`/pilot/${orgSlug}`, 'layout')
    return {
      error: null,
      success: result.promoted
        ? 'Storniert — die nächste Familie von der Warteliste ist jetzt angemeldet.'
        : 'Anmeldung storniert.',
    }
  } catch {
    return { error: 'Konnte nicht storniert werden — erneut versuchen.', success: null }
  }
}
