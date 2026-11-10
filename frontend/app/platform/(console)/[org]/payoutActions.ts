'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminActionError, fetchMe, markPayoutPaidAdmin } from '../../../lib/saasAdminApi'

export interface PayoutMarkState {
  error: string | null
  saved: boolean
}

const MONTH = /^20[0-9]{2}-(0[1-9]|1[0-2])$/
const DAY = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/

/** Owner only: record that the month's payout was transferred to the club. */
export async function markPayoutPaidAction(
  orgSlug: string,
  month: string,
  _previous: PayoutMarkState,
  formData: FormData,
): Promise<PayoutMarkState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }
  const paidAt = String(formData.get('paid_at') ?? '').trim()
  const reference = String(formData.get('reference') ?? '').trim()
  if (!MONTH.test(month)) return { error: 'Ungültiger Monat.', saved: false }
  if (!DAY.test(paidAt)) return { error: 'Bitte das Überweisungsdatum angeben.', saved: false }
  if (!reference || reference.length > 140) return { error: 'Bitte einen Verwendungszweck (höchstens 140 Zeichen) angeben.', saved: false }
  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Auszahlungen markieren.', saved: false }
    await markPayoutPaidAdmin(orgSlug, token, month, { paid_at: paidAt, reference })
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Auszahlung konnte nicht gespeichert werden.', saved: false }
  }
  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}
