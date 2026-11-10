'use client'

import { useActionState } from 'react'
import Button from '../../../components/saas/ui/Button'
import { setPaymentRouteAction, type OnlinePaymentSwitchState } from './stripeActions'

/** Owner only: how this club's online payments run. Default: CampsPilot collects (platform). */
export default function PaymentRouteSelect({ orgSlug, route }: { orgSlug: string; route: 'platform' | 'connect' }) {
  const [state, formAction, pending] = useActionState<OnlinePaymentSwitchState, FormData>(
    (previous, data) => setPaymentRouteAction(orgSlug, previous, data),
    { error: null, saved: false },
  )
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3" data-testid="payment-route">
      <label htmlFor="payment_route" className="cp-body">Zahlungsweg</label>
      <select id="payment_route" name="route" defaultValue={route} className="cp-body rounded border px-2 py-1" style={{ borderColor: 'var(--cp-line)' }}>
        <option value="platform">Plattform (CampsPilot zieht ein, du überweist)</option>
        <option value="connect">Vereinskonto bei Stripe (Altbestand, kein Fallback)</option>
      </select>
      <Button type="submit" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Speichern'}</Button>
      {!pending && state.error && <p role="alert">{state.error}</p>}
    </form>
  )
}
