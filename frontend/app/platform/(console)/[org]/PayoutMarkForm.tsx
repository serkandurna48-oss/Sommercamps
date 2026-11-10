'use client'

import { useActionState } from 'react'
import Button from '../../../components/saas/ui/Button'
import { markPayoutPaidAction, type PayoutMarkState } from './payoutActions'

/** Owner only: "Als überwiesen markieren" after the bank transfer was made. */
export default function PayoutMarkForm({ orgSlug, month, today, reference }: { orgSlug: string; month: string; today: string; reference: string }) {
  const [state, formAction, pending] = useActionState<PayoutMarkState, FormData>(
    (previous, data) => markPayoutPaidAction(orgSlug, month, previous, data),
    { error: null, saved: false },
  )
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="cp-body flex flex-col gap-1">
        Überwiesen am
        <input name="paid_at" type="date" defaultValue={today} required className="cp-body rounded border px-2 py-1" style={{ borderColor: 'var(--cp-line)' }} />
      </label>
      <label className="cp-body flex min-w-[240px] flex-1 flex-col gap-1">
        Verwendungszweck
        <input name="reference" type="text" defaultValue={reference} maxLength={140} required className="cp-body rounded border px-2 py-1" style={{ borderColor: 'var(--cp-line)' }} />
      </label>
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Als überwiesen markieren'}</Button>
      {!pending && state.error && <p role="alert" className="w-full">{state.error}</p>}
    </form>
  )
}
