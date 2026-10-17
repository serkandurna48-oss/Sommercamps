'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import {
  cancelRegistrationAdmin,
  promoteWaitlistAdmin,
  updateRegistrationDetailsAdmin,
  type RegistrationAdmin,
} from '../../../lib/saasAdminApi'
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

export interface RegistrationDetailsActionState {
  error: string | null
  saved: boolean
  /** Die vom Server tatsächlich gespeicherten Werte, direkt aus der
   * Response dieses Aufrufs (Bug, gefunden im Review beim Camp-Status-
   * Fix — siehe CampConfigForm): eine erneut vom Server geholte Prop
   * kann durch Revalidierungs-Timing kurzzeitig veraltet sein. Die Anzeige
   * nach dem Speichern darf sich deshalb NICHT auf eine später
   * nachgelieferte Prop verlassen, sondern nur auf das, was diese Action
   * selbst gerade vom Server zurückbekommen hat. */
  registration: RegistrationAdmin | null
}

/**
 * MVP-Auftrag "Teilnehmerdaten-Korrektur": lässt einen org_admin/owner
 * Tippfehler oder veraltete Angaben in einer bereits eingegangenen
 * Anmeldung korrigieren. Bewusst nur die vier im Auftrag genannten Felder
 * (Name, Trikotgröße, Allergien, Abholberechtigte) — Eltern-Kontakt- und
 * medizinische Felder bleiben unangetastet, das war nicht Teil des
 * Auftrags.
 */
export async function updateRegistrationDetailsAction(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  _prev: RegistrationDetailsActionState,
  formData: FormData,
): Promise<RegistrationDetailsActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', saved: false, registration: null }

  const childFirstName = String(formData.get('child_first_name') ?? '').trim()
  const childLastName = String(formData.get('child_last_name') ?? '').trim()
  if (!childFirstName || !childLastName) {
    return { error: 'Vor- und Nachname dürfen nicht leer sein.', saved: false, registration: null }
  }
  const optional = (key: string) => {
    const value = String(formData.get(key) ?? '').trim()
    return value ? value : null
  }

  try {
    const registration = await updateRegistrationDetailsAdmin(orgSlug, campSlug, registrationToken, token, {
      child_first_name: childFirstName,
      child_last_name: childLastName,
      jersey_size: optional('jersey_size'),
      allergies: optional('allergies'),
      pickup_authorized: optional('pickup_authorized'),
    })
    revalidatePath(`/pilot/${orgSlug}`, 'layout')
    return { error: null, saved: true, registration }
  } catch {
    return { error: 'Konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.', saved: false, registration: null }
  }
}
