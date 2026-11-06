'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import type { Invoice, RegistrationInvoices } from '../../../lib/saasAdminApi'
import {
  createInvoiceAction,
  loadRegistrationInvoicesAction,
  refundPaymentAction,
  resendInvoiceAction,
  type InvoiceActionState,
} from '../actions/invoiceActions'
import Button from '../ui/Button'
import { formatDate, formatEuro } from '../../../lib/i18n/de'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'

const INITIAL: InvoiceActionState = { error: null, success: null }

export const euroText = (cents: number) => formatEuro(cents)

export function invoiceStatus(invoice: Pick<Invoice, 'sent_at' | 'send_error'>): string {
  if (invoice.sent_at) return 'Gesendet'
  if (invoice.send_error) return 'Versand fehlgeschlagen'
  return 'Nicht gesendet'
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID()
}

function InvoiceRow({ orgSlug, invoice, onChanged }: { orgSlug: string; invoice: Invoice; onChanged: () => void }) {
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(async previous => {
    const result = await resendInvoiceAction(orgSlug, invoice.id, previous)
    onChanged()
    return result
  }, INITIAL)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" style={{ borderTop: '1px solid var(--cp-line-2)' }}>
      <span className="cp-body font-semibold">{invoice.kind === 'storno' ? 'Storno ' : ''}{invoice.number}</span>
      <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{formatDate(invoice.issue_date)}</span>
      <span className="cp-body">{euroText(invoice.gross_cents)}</span>
      <span className="cp-chip" style={{ color: invoice.send_error && !invoice.sent_at ? 'var(--cp-error)' : 'var(--cp-muted)' }}>{invoiceStatus(invoice)}</span>
      <a className="cp-chip underline" href={`/pilot/${orgSlug}/rechnungen/${invoice.id}`} download>PDF herunterladen</a>
      <form action={action}>
        <Button type="submit" disabled={pending}>{pending ? 'Wird gesendet …' : 'Erneut senden'}</Button>
      </form>
      {!pending && state.error && <p role="alert" className="w-full">{state.error}</p>}
      {!pending && state.success && <p role="status" className="w-full">{state.success}</p>}
    </li>
  )
}

function RefundForm({ orgSlug, registrationToken, remainingCents, onDone }: {
  orgSlug: string; registrationToken: string; remainingCents: number; onDone: () => void
}) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [requestId, setRequestId] = useState(newRequestId)
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(async (previous, data) => {
    const result = await refundPaymentAction(orgSlug, registrationToken, remainingCents, previous, data)
    if (result.success) {
      setRequestId(newRequestId()) // next refund is a new intent
      onDone()
    }
    return result
  }, INITIAL)
  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-3"
      onSubmit={event => {
        const data = new FormData(event.currentTarget)
        const amount = data.get('mode') === 'partial' ? `${String(data.get('amount') ?? '').trim()} €` : euroText(remainingCents)
        if (!window.confirm(`${amount} an die Familie erstatten?\nDas Geld geht vom Konto deines Vereins zurück, die Familie bekommt eine Stornorechnung. Das lässt sich nicht rückgängig machen.`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="cp-label mb-1">Erstattung</legend>
        <label className="cp-body flex items-center gap-2">
          <input type="radio" name="mode" value="full" checked={mode === 'full'} onChange={() => setMode('full')} />
          Komplett ({euroText(remainingCents)})
        </label>
        <label className="cp-body flex items-center gap-2">
          <input type="radio" name="mode" value="partial" checked={mode === 'partial'} onChange={() => setMode('partial')} />
          Teilbetrag
        </label>
      </fieldset>
      {mode === 'partial' && (
        <Field label="Betrag" htmlFor={`refund-${registrationToken}`} suffix="€" hint={`Höchstens ${euroText(remainingCents)}.`}>
          <input id={`refund-${registrationToken}`} name="amount" inputMode="decimal" required className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      )}
      <div>
        <Button type="submit" variant="danger" disabled={pending}>{pending ? 'Wird erstattet …' : 'Erstatten'}</Button>
      </div>
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.success && <p role="status">{state.success}</p>}
    </form>
  )
}

/** Booking detail: the parent's invoices, resend, pending hint, online refund. */
export default function InvoiceSection({ orgSlug, registrationToken }: { orgSlug: string; registrationToken: string }) {
  const [data, setData] = useState<RegistrationInvoices | null | undefined>(undefined)
  const reload = useCallback(() => {
    loadRegistrationInvoicesAction(orgSlug, registrationToken).then(setData, () => setData(null))
  }, [orgSlug, registrationToken])
  useEffect(() => { reload() }, [reload])
  const [created, createAction, creating] = useActionState<InvoiceActionState, FormData>(async previous => {
    const result = await createInvoiceAction(orgSlug, registrationToken, previous)
    reload()
    return result
  }, INITIAL)

  if (data === undefined) return <p className="cp-body" role="status">Rechnungen werden geladen …</p>
  if (data === null) return <p className="cp-body" role="alert">Rechnungen konnten nicht geladen werden.</p>

  return (
    <section aria-label="Rechnung" className="flex flex-col gap-2">
      <p className="cp-label" style={{ color: 'var(--cp-muted)' }}>Rechnung</p>
      {data.invoices.length > 0 ? (
        <ul>{data.invoices.map(invoice => <InvoiceRow key={invoice.id} orgSlug={orgSlug} invoice={invoice} onChanged={reload} />)}</ul>
      ) : data.pending_reason === 'missing_billing_profile' ? (
        <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
          Rechnung ausstehend – Rechnungsdaten fehlen. Trag sie unter <a className="underline" href={`/pilot/${orgSlug}/konfiguration#rechnungsdaten`}>Einstellungen → Rechnungsdaten</a> ein und erstelle die Rechnung dann hier.
        </p>
      ) : (
        <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Noch keine Rechnung.</p>
      )}
      {data.can_create && (
        <form action={createAction}>
          <Button type="submit" disabled={creating}>{creating ? 'Wird erstellt …' : 'Rechnung erstellen'}</Button>
        </form>
      )}
      {!creating && created.error && <p role="alert">{created.error}</p>}
      {!creating && created.success && <p role="status">{created.success}</p>}
      {data.refund.possible && (
        <RefundForm orgSlug={orgSlug} registrationToken={registrationToken} remainingCents={data.refund.remaining_cents} onDone={reload} />
      )}
    </section>
  )
}
