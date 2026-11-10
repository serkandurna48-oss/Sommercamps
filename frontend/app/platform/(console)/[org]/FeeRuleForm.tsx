'use client'

import { useActionState, useState } from 'react'
import Field from '../../../components/saas/ui/Field'
import Button from '../../../components/saas/ui/Button'
import { INPUT_CLASS, INPUT_STYLE } from '../../../components/saas/ui/formFieldStyles'
import { addFeeRuleAction, type FeeRuleActionState } from './feeActions'

const PLAN_HINT: Record<string, string> = {
  starter: 'Starter: 6,90 % und 0 € Grundgebühr, wenn nichts eingetragen ist. 1 aktives Camp.',
  verein: 'Verein: 4,90 % und 24,90 € Grundgebühr pro Monat, wenn nichts eingetragen ist. Unbegrenzt Camps.',
  individuell: 'Individuell: Prozentsatz ist Pflicht, Grundgebühr 0 €, wenn nichts eingetragen ist. Unbegrenzt Camps.',
}

/** Owner only. Appends a rule; bookings keep the fee they were paid with. */
export default function FeeRuleForm({ orgSlug, today }: { orgSlug: string; today: string }) {
  const [plan, setPlan] = useState('starter')
  const [state, formAction, pending] = useActionState<FeeRuleActionState, FormData>(
    (previous, data) => addFeeRuleAction(orgSlug, previous, data),
    { error: null, saved: false },
  )
  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paket" htmlFor="fee_plan" hint={PLAN_HINT[plan]}>
          <select id="fee_plan" name="plan" value={plan} onChange={event => setPlan(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE}>
            <option value="starter">Starter</option>
            <option value="verein">Verein</option>
            <option value="individuell">Individuell</option>
          </select>
        </Field>
        <Field label="Prozent je Buchung" htmlFor="fee_percent" suffix="%">
          <input id="fee_percent" name="percent" inputMode="decimal" placeholder={plan === 'verein' ? '4,90' : plan === 'starter' ? '6,90' : ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Fixbetrag je Buchung (optional)" htmlFor="fee_fixed" suffix="€">
          <input id="fee_fixed" name="fixed_eur" inputMode="decimal" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Mindestgebühr je Buchung (optional)" htmlFor="fee_min" suffix="€">
          <input id="fee_min" name="min_eur" inputMode="decimal" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Grundgebühr pro Monat (optional)" htmlFor="fee_monthly" suffix="€" hint="Leer lassen = Paketstandard. 0 = bewusst keine Grundgebühr. Beträge zzgl. USt.">
          <input id="fee_monthly" name="monthly_eur" inputMode="decimal" placeholder={plan === 'verein' ? '24,90' : plan === 'starter' ? '0' : ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Gültig ab" htmlFor="fee_valid_from" hint="Gilt für Buchungen ab diesem Tag; bereits bezahlte Buchungen behalten ihre Gebühr.">
          <input id="fee_valid_from" name="valid_from" type="date" required defaultValue={today} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Notiz (optional)" htmlFor="fee_note">
          <input id="fee_note" name="note" maxLength={500} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </div>
      {pending && <p role="status">Wird gespeichert …</p>}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.saved && <p role="status">Gebühr gespeichert.</p>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Gebühr festlegen'}</Button>
      </div>
    </form>
  )
}
