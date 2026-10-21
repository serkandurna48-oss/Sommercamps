'use client'

import { useActionState, useState } from 'react'
import Field from '../../../components/saas/ui/Field'
import Button from '../../../components/saas/ui/Button'
import { INPUT_CLASS, INPUT_STYLE } from '../../../components/saas/ui/formFieldStyles'
import { updateBillingNotesAction, type BillingActionState } from './billingActions'

export default function BillingNotesForm({ orgSlug, billingNotes }: { orgSlug: string; billingNotes: string | null }) {
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [previousNotes, setPreviousNotes] = useState(billingNotes)
  if (previousNotes !== billingNotes) {
    setPreviousNotes(billingNotes)
    setSubmitted(null)
  }
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(async (previous, data) => {
    // Preserve input after a failed action, when React resets the form.
    setSubmitted(String(data.get('billing_notes') ?? ''))
    return updateBillingNotesAction(orgSlug, previous, data)
  }, { error: null, saved: false })

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <Field label="Konditionen" htmlFor="billing_notes" hint="Interne Vertragsnotizen – nur für Plattform-Betreiber sichtbar.">
        <textarea
          id="billing_notes"
          name="billing_notes"
          rows={3}
          defaultValue={submitted ?? billingNotes ?? ''}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>
      {pending && <p role="status">Wird gespeichert …</p>}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.saved && <p role="status">Gespeichert.</p>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Wird gespeichert …' : 'Konditionen speichern'}
        </Button>
      </div>
    </form>
  )
}