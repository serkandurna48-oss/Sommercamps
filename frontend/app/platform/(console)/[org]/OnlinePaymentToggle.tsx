'use client'

import { useActionState } from 'react'
import Button from '../../../components/saas/ui/Button'
import { setOnlinePaymentEnabledAction, type OnlinePaymentSwitchState } from './stripeActions'

/** Owner only. Online payment for a club starts only after this approval
 * (Managed Risk direct charges, legacy and B2 destination accounts alike). */
export default function OnlinePaymentToggle({ orgSlug, enabled }: { orgSlug: string; enabled: boolean }) {
  const [state, formAction, pending] = useActionState<OnlinePaymentSwitchState, FormData>(
    previous => setOnlinePaymentEnabledAction(orgSlug, !enabled, previous),
    { error: null, saved: false },
  )
  return (
    <form
      action={formAction}
      className="mt-3 flex flex-wrap items-center gap-3"
      onSubmit={event => {
        if (enabled && !window.confirm('Online-Zahlung für diesen Verein sperren?\nEltern können dann nicht mehr online bezahlen.')) event.preventDefault()
      }}
    >
      <span className="cp-body" data-testid="online-payment-switch">Online-Zahlung: {enabled ? 'freigegeben' : 'gesperrt'}</span>
      <Button type="submit" variant={enabled ? 'danger' : 'primary'} disabled={pending}>
        {pending ? 'Wird gespeichert …' : enabled ? 'Sperren' : 'Freigeben'}
      </Button>
      {!pending && state.error && <p role="alert">{state.error}</p>}
    </form>
  )
}
