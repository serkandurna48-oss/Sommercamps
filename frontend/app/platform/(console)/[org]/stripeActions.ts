'use server'

import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminActionError, connectStripeAccount, fetchMe } from '../../../lib/saasAdminApi'

export interface StripeConnectState {
  error: string | null
  result: string | null
}

const ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,}$/

export async function connectStripeAccountAction(
  orgSlug: string,
  _previous: StripeConnectState,
  formData: FormData,
): Promise<StripeConnectState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', result: null }
  const accountId = String(formData.get('stripe_account_id') ?? '').trim()
  if (!ACCOUNT_ID.test(accountId)) return { error: 'Bitte eine Stripe-Konto-ID im Format acct_… eingeben.', result: null }
  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Stripe-Konten verbinden.', result: null }
    const status = await connectStripeAccount(orgSlug, token, accountId)
    return {
      error: null,
      result: status.online_payment_enabled
        ? 'Verbunden. Online-Zahlung ist für diesen Verein aktiv.'
        : 'Verbunden, aber Stripe erlaubt für dieses Konto noch keine Zahlungen. Der Verein muss die Kontoeinrichtung bei Stripe abschließen.',
    }
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Stripe-Konto konnte nicht verbunden werden.', result: null }
  }
}
