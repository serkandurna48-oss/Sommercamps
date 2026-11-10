'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import { de, formatEuro } from '../../../lib/i18n/de'
import type { Invoice, RegistrationInvoices } from '../../../lib/saasAdminApi'
import { createInvoiceAction, loadRegistrationInvoicesAction, type InvoiceActionState } from '../actions/invoiceActions'
import Button from '../ui/Button'

const INITIAL: InvoiceActionState = { error: null, success: null }

function formatIssueDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  return `${day}.${month}.${year}`
}

function InvoiceRow({ orgSlug, invoice }: { orgSlug: string; invoice: Invoice }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" style={{ borderTop: '1px solid var(--cp-line-2)' }}>
      <span className="cp-body font-semibold">
        {invoice.kind === 'storno' ? `${de.invoices.storno} ` : ''}
        {invoice.number}
      </span>
      <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        {formatIssueDate(invoice.issue_date)}
      </span>
      <span className="cp-body">{formatEuro(invoice.gross_cents)}</span>
      <a className="cp-chip underline" href={`/pilot/${orgSlug}/rechnungen/${invoice.id}`} download>
        {de.invoices.download}
      </a>
    </li>
  )
}

/**
 * One booking's parent invoices. The download link stays on this origin:
 * the route handler attaches the httpOnly admin cookie as a Bearer token.
 * Shown only for paid or refunded bookings (see ParticipantDetail).
 */
export default function InvoiceSection({ orgSlug, registrationToken }: { orgSlug: string; registrationToken: string }) {
  const [data, setData] = useState<RegistrationInvoices | null | undefined>(undefined)
  const reload = useCallback(() => {
    loadRegistrationInvoicesAction(orgSlug, registrationToken).then(setData, () => setData(null))
  }, [orgSlug, registrationToken])
  useEffect(() => {
    reload()
  }, [reload])
  const [created, createAction, creating] = useActionState<InvoiceActionState, FormData>(async () => {
    const result = await createInvoiceAction(orgSlug, registrationToken)
    reload()
    return result
  }, INITIAL)

  if (data === undefined) {
    return (
      <p className="cp-body" role="status">
        {de.invoices.loading}
      </p>
    )
  }
  if (data === null) {
    return (
      <p className="cp-body" role="alert">
        {de.invoices.loadError}
      </p>
    )
  }

  const missingProfile = data.pending_reason === 'missing_billing_profile'
  const failed = data.pending_reason === 'error'

  return (
    <section aria-label={de.invoices.heading} className="flex flex-col gap-2">
      <p className="cp-label" style={{ color: 'var(--cp-muted)' }}>
        {de.invoices.heading}
      </p>
      {data.invoices.length > 0 ? (
        <ul>
          {data.invoices.map(invoice => (
            <InvoiceRow key={invoice.id} orgSlug={orgSlug} invoice={invoice} />
          ))}
        </ul>
      ) : failed ? (
        <p
          className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
        >
          {de.invoices.failed}
        </p>
      ) : missingProfile ? (
        <p
          className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}
        >
          {de.invoices.missingProfile}
        </p>
      ) : (
        <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
          {de.invoices.empty}
        </p>
      )}
      {data.can_create && !missingProfile && (
        <form action={createAction}>
          <Button type="submit" disabled={creating}>
            {creating ? de.invoices.creating : de.invoices.create}
          </Button>
        </form>
      )}
      {!creating && created.error && <p role="alert">{created.error}</p>}
      {!creating && created.success && <p role="status">{created.success}</p>}
    </section>
  )
}
