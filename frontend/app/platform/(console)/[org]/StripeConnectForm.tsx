'use client'

import { useActionState } from 'react'
import Field from '../../../components/saas/ui/Field'
import Button from '../../../components/saas/ui/Button'
import { INPUT_CLASS, INPUT_STYLE } from '../../../components/saas/ui/formFieldStyles'
import { connectStripeAccountAction, type StripeConnectState } from './stripeActions'

/** Owner only. Links the club's Stripe account (already connected to the platform). */
export default function StripeConnectForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<StripeConnectState, FormData>(
    (previous, data) => connectStripeAccountAction(orgSlug, previous, data),
    { error: null, result: null },
  )
  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <Field label="Stripe-Konto-ID" htmlFor="stripe_account_id" hint="Konto des Vereins aus dem Stripe-Dashboard unter Connect, Format acct_…. Eltern zahlen direkt an dieses Konto.">
        <input id="stripe_account_id" name="stripe_account_id" required pattern="acct_[A-Za-z0-9]{8,}" autoComplete="off" spellCheck={false} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      {pending && <p role="status">Wird verbunden …</p>}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.result && <p role="status">{state.result}</p>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Wird verbunden …' : 'Stripe-Konto verbinden'}
        </Button>
      </div>
    </form>
  )
}
