'use client'

import { useActionState } from 'react'
import { generatePendingInvoicesAction, type InvoiceActionState } from '../actions/invoiceActions'
import { previewNoopAction, useAdminPreview } from '../preview/AdminPreviewContext'
import Button from '../ui/Button'

/** Settings hint: paid bookings without invoice because master data was missing. */
export default function PendingInvoicesNotice({ orgSlug, count, profileComplete }: { orgSlug: string; count: number; profileComplete: boolean }) {
  const preview = useAdminPreview()
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(
    preview ? previewNoopAction : previous => generatePendingInvoicesAction(orgSlug, previous),
    { error: null, success: null },
  )
  return (
    <div className="cp-body mb-4 flex flex-col gap-2 rounded-[var(--cp-r-chip)] border px-3 py-2" data-testid="pending-invoices"
      style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
      <p>
        {count === 1 ? '1 Rechnung ist' : `${count} Rechnungen sind`} ausstehend – Rechnungsdaten fehlen.{' '}
        {profileComplete ? 'Deine Rechnungsdaten sind jetzt vollständig.' : 'Trag die Rechnungsdaten unten ein und speichere sie.'}
      </p>
      {profileComplete && (
        <form action={action}>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Wird erstellt …' : 'Ausstehende Rechnungen erstellen'}</Button>
        </form>
      )}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.success && <p role="status">{state.success}</p>}
    </div>
  )
}
