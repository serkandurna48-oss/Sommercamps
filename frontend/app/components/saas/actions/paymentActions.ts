'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { setPaymentStatusAdmin, type PaymentStatus } from '../../../lib/saasAdminApi'
import type { ActionFormState } from '../ui/ActionForm'

/**
 * Manuelle Zahlungs-Buchführung — es gibt noch keine Stripe-/
 * Zahlungsanbieter-Integration in backend_saas (siehe README.md), also
 * trägt der Organisator eine erhaltene Zahlung (Überweisung/Bar) selbst
 * ein. `successMessage` kommt von der Aufrufstelle, damit z. B. "Als
 * bezahlt markiert" vs. "Als erlassen markiert" nicht hier fest verdrahtet
 * ist.
 */
export async function setPaymentStatusAction(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  paymentStatus: PaymentStatus,
  successMessage: string,
  _prev: ActionFormState,
): Promise<ActionFormState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', success: null }

  try {
    await setPaymentStatusAdmin(orgSlug, campSlug, registrationToken, token, paymentStatus)
  } catch {
    return { error: 'Konnte nicht gespeichert werden — erneut versuchen.', success: null }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { error: null, success: successMessage }
}
