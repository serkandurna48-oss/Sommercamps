'use server'

import { de } from '../../../lib/i18n/de'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminConnectionError, setPaymentStatusAdmin, type PaymentStatus } from '../../../lib/saasAdminApi'
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
  const token = await getValidAccessToken()
  if (!token) return { error: de.adminActions.sessionExpired, success: null }

  try {
    await setPaymentStatusAdmin(orgSlug, campSlug, registrationToken, token, paymentStatus)
  } catch (error) {
    return { error: error instanceof AdminConnectionError ? error.message : de.adminActions.saveFailed, success: null }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { error: null, success: successMessage }
}
