'use client'

import { useActionState } from 'react'
import type { InvoiceOpenWork } from '../../../lib/saasAdminApi'
import { generatePendingInvoicesAction, type InvoiceActionState } from '../actions/invoiceActions'
import { previewNoopAction, useAdminPreview } from '../preview/AdminPreviewContext'
import Button from '../ui/Button'

function describe(open: InvoiceOpenWork): string[] {
  const parts: string[] = []
  if (open.missing_profile > 0) {
    parts.push(`${open.missing_profile === 1 ? '1 Rechnung ist' : `${open.missing_profile} Rechnungen sind`} ausstehend – Rechnungsdaten fehlen.`)
  }
  if (open.failed > 0) parts.push(`${open.failed === 1 ? '1 Rechnung konnte' : `${open.failed} Rechnungen konnten`} nicht erzeugt werden.`)
  const other = open.invoices - open.missing_profile - open.failed
  if (other > 0) parts.push(`${other === 1 ? '1 bezahlte Buchung hat' : `${other} bezahlte Buchungen haben`} noch keine Rechnung.`)
  if (open.stornos > 0) parts.push(`${open.stornos === 1 ? '1 Stornorechnung fehlt' : `${open.stornos} Stornorechnungen fehlen`}.`)
  if (open.unsent_mails > 0) parts.push(`${open.unsent_mails === 1 ? '1 Rechnung wurde' : `${open.unsent_mails} Rechnungen wurden`} noch nicht per E-Mail zugestellt.`)
  return parts
}

/** Hint with the "Rechnungen erzeugen" action (missing, failed, storno, unsent mail). */
export default function PendingInvoicesNotice({ orgSlug, open, profileComplete }: { orgSlug: string; open: InvoiceOpenWork; profileComplete: boolean }) {
  const preview = useAdminPreview()
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(
    preview ? previewNoopAction : previous => generatePendingInvoicesAction(orgSlug, previous),
    { error: null, success: null },
  )
  if (open.total === 0 && !state.success) return null
  const actionable = open.total - open.missing_profile > 0 || (profileComplete && open.total > 0)
  return (
    <div className="cp-body mb-4 flex flex-col gap-2 rounded-[var(--cp-r-chip)] border px-3 py-2" data-testid="pending-invoices"
      style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
      {describe(open).map(line => <p key={line}>{line}</p>)}
      {!profileComplete && open.missing_profile > 0 && (
        <p>Trag die <a className="underline" href={`/pilot/${orgSlug}/konfiguration#rechnungsdaten`}>Rechnungsdaten</a> ein und speichere sie.</p>
      )}
      {actionable && (
        <form action={action}>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Wird erzeugt …' : 'Rechnungen erzeugen'}</Button>
        </form>
      )}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.success && <p role="status">{state.success}</p>}
    </div>
  )
}
