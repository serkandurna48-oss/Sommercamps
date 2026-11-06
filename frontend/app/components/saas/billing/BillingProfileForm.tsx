'use client'

import { useActionState, useState } from 'react'
import type { BillingProfile, TaxStatus } from '../../../lib/saasAdminApi'
import { saveBillingProfileAction, type BillingProfileActionState } from '../actions/billingActions'
import { previewNoopAction, useAdminPreview } from '../preview/AdminPreviewContext'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'

/** Invoice sender data (parent invoices are issued in the club's name). */
export default function BillingProfileForm({ orgSlug, profile }: { orgSlug: string; profile: BillingProfile | null }) {
  const preview = useAdminPreview()
  const [taxStatus, setTaxStatus] = useState<TaxStatus>(profile?.tax_status ?? 'ust_pflichtig')
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null)
  const [state, formAction, pending] = useActionState<BillingProfileActionState, FormData>(async (previous, data) => {
    // React resets uncontrolled fields after an action; keep what was typed.
    setSubmitted(Object.fromEntries([...data].filter((e): e is [string, string] => typeof e[1] === 'string')))
    return preview ? previewNoopAction(previous) : saveBillingProfileAction(orgSlug, previous, data)
  }, { error: null, saved: false })
  const value = (field: keyof BillingProfile) => submitted?.[field] ?? (profile?.[field] == null ? '' : String(profile[field]))
  const errorFor = (field: string) => (!pending && state.field === field ? state.error ?? undefined : undefined)

  const input = (field: keyof BillingProfile, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} htmlFor={`billing_${field}`} hint={hint} error={errorFor(field)}>
      <input id={`billing_${field}`} name={field} defaultValue={value(field)} className={INPUT_CLASS} style={INPUT_STYLE} {...props} />
    </Field>
  )

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {!profile && (
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Trag hier die Daten ein, mit denen dein Verein Rechnungen an Eltern stellt. Ohne diese Angaben können keine Rechnungen erstellt werden.
        </p>
      )}
      {input('legal_name', 'Rechtlicher Name', { required: true, autoComplete: 'organization' }, 'So wie im Vereins- oder Handelsregister, z. B. „SV Musterstadt e. V.“')}
      {input('street', 'Straße und Hausnummer', { required: true, autoComplete: 'street-address' })}
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        {input('postal_code', 'PLZ', { required: true, inputMode: 'numeric', maxLength: 5, autoComplete: 'postal-code' })}
        {input('city', 'Ort', { required: true, autoComplete: 'address-level2' })}
      </div>

      <Field label="Steuerstatus" htmlFor="billing_tax_status" error={errorFor('tax_status')}>
        <select
          id="billing_tax_status" name="tax_status" value={taxStatus}
          onChange={event => setTaxStatus(event.target.value as TaxStatus)}
          className={INPUT_CLASS} style={INPUT_STYLE}
        >
          <option value="ust_pflichtig">Umsatzsteuerpflichtig</option>
          <option value="kleinunternehmer">Kleinunternehmer (§ 19 UStG)</option>
          <option value="steuerbefreit">Steuerbefreit</option>
        </select>
      </Field>
      {taxStatus === 'ust_pflichtig' && (
        <Field label="Umsatzsteuersatz" htmlFor="billing_default_vat_rate" error={errorFor('default_vat_rate')} hint="Wird auf der Rechnung ausgewiesen (netto, USt, brutto).">
          <select id="billing_default_vat_rate" name="default_vat_rate" defaultValue={value('default_vat_rate') || '19'} className={INPUT_CLASS} style={INPUT_STYLE}>
            <option value="19">19 %</option>
            <option value="7">7 %</option>
          </select>
        </Field>
      )}
      {taxStatus === 'steuerbefreit' && (
        <Field label="Grund der Steuerbefreiung" htmlFor="billing_tax_exemption_text" error={errorFor('tax_exemption_text')} hint="Erscheint so auf der Rechnung, z. B. „Steuerfrei nach § 4 Nr. 22 b UStG“.">
          <textarea id="billing_tax_exemption_text" name="tax_exemption_text" rows={2} defaultValue={value('tax_exemption_text')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {input('tax_number', 'Steuernummer', { inputMode: 'numeric' }, taxStatus === 'steuerbefreit' ? 'Optional.' : 'Steuernummer oder USt-IdNr. ist Pflicht.')}
        {input('vat_id', 'USt-IdNr.', { placeholder: 'DE123456789' })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {input('invoice_number_prefix', 'Präfix für Rechnungsnummern', { required: true, maxLength: 12, placeholder: 'z. B. SV-' }, 'Rechnungsnummern werden fortlaufend vergeben, z. B. SV-0001.')}
        {input('invoice_email', 'E-Mail für Rechnungsfragen', { required: true, type: 'email', autoComplete: 'email' }, 'Steht auf jeder Rechnung als Kontakt.')}
      </div>

      {pending && <p role="status">Wird gespeichert …</p>}
      {!pending && state.error && !state.field && <p role="alert">{state.error}</p>}
      {!pending && state.saved && <SuccessNote>Rechnungsdaten gespeichert.</SuccessNote>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Rechnungsdaten speichern'}</Button>
      </div>
    </form>
  )
}
