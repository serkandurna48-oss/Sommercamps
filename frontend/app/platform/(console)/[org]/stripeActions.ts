'use server'

import { getValidAccessToken } from '../../../lib/supabaseServer'
import { revalidatePath } from 'next/cache'
import { AdminActionError, connectStripeAccount, fetchMe, setOnlinePaymentEnabledAdmin, setPaymentRouteAdmin } from '../../../lib/saasAdminApi'

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

export interface OnlinePaymentSwitchState {
  error: string | null
  saved: boolean
}

/** Owner only: per-club kill switch for online payment (Express and legacy). */
export async function setOnlinePaymentEnabledAction(
  orgSlug: string,
  enabled: boolean,
  _previous: OnlinePaymentSwitchState,
): Promise<OnlinePaymentSwitchState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }
  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Online-Zahlung freischalten.', saved: false }
    await setOnlinePaymentEnabledAdmin(orgSlug, token, enabled)
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Online-Zahlung konnte nicht umgeschaltet werden.', saved: false }
  }
  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}

/** Owner only: payment route per club (platform = CampsPilot collects; connect = the club's own account). */
export async function setPaymentRouteAction(
  orgSlug: string,
  _previous: OnlinePaymentSwitchState,
  formData: FormData,
): Promise<OnlinePaymentSwitchState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }
  const route = String(formData.get('route') ?? '')
  if (route !== 'platform' && route !== 'connect') return { error: 'Bitte einen Zahlungsweg wählen.', saved: false }
  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen den Zahlungsweg ändern.', saved: false }
    await setPaymentRouteAdmin(orgSlug, token, route)
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Zahlungsweg konnte nicht geändert werden.', saved: false }
  }
  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}
