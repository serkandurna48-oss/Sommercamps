'use client'

import { useActionState } from 'react'
import type { SalesLead, SalesMember } from '../../lib/saasAdminApi'
import { INPUT_CLASS, INPUT_STYLE } from '../../components/saas/ui/formFieldStyles'
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from '../labels'
import { assignLeadAction, createLeadAction, updateLeadAction, type LeadFormState } from './actions'

const initial: LeadFormState = { error: null, notice: null }
const BTN = 'cp-focus cp-btn inline-flex min-h-[44px] items-center justify-center px-4 disabled:opacity-50'

function Feedback({ state }: { state: LeadFormState }) {
  if (state.error) return <p className="cp-chip mt-2" role="alert" style={{ color: 'var(--cp-error)' }}>{state.error}</p>
  if (state.notice) return <p className="cp-chip mt-2" role="status" style={{ color: 'var(--cp-ok)' }}>{state.notice}</p>
  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="cp-label" style={{ color: 'var(--cp-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function MasterDataFields({ lead }: { lead?: SalesLead }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name *">
        <input name="name" required defaultValue={lead?.name} maxLength={200} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="Art">
        <select name="kind" defaultValue={lead?.kind ?? 'verein'} className={INPUT_CLASS} style={INPUT_STYLE}>
          {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="Ort">
        <input name="city" defaultValue={lead?.city ?? ''} maxLength={120} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="Passung">
        <select name="fit" defaultValue={lead?.fit ?? ''} className={INPUT_CLASS} style={INPUT_STYLE}>
          <option value="">–</option>
          <option value="A">A – passt sehr gut</option>
          <option value="B">B – passt</option>
          <option value="C">C – eher nicht</option>
        </select>
      </Field>
      <Field label="Ansprechpartner">
        <input name="contact_name" defaultValue={lead?.contact_name ?? ''} maxLength={120} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="Telefon">
        <input name="phone" type="tel" defaultValue={lead?.phone ?? ''} maxLength={60} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="E-Mail">
        <input name="email" type="email" defaultValue={lead?.email ?? ''} maxLength={254} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="Website">
        <input name="website" defaultValue={lead?.website ?? ''} maxLength={500} inputMode="url" className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
    </div>
  )
}

export function NewLeadForm() {
  const [state, action, pending] = useActionState(createLeadAction, initial)
  return (
    <form action={action} className="flex flex-col gap-4">
      <MasterDataFields />
      <Field label="Nächster Schritt am">
        <input name="next_action_at" type="date" className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <Field label="Notiz (optional)">
        <textarea name="note" rows={3} maxLength={4000} className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <div>
        <button type="submit" disabled={pending} className={`${BTN} cp-btn-primary`}>
          {pending ? 'Wird angelegt …' : 'Lead anlegen'}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}

/** The everyday step after a call: status, next date, note — one save. */
export function NextStepForm({ lead }: { lead: SalesLead }) {
  const [state, action, pending] = useActionState(updateLeadAction.bind(null, lead.id), initial)
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <select name="status" defaultValue={lead.status} className={INPUT_CLASS} style={INPUT_STYLE}>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Nächster Schritt am">
          <input name="next_action_at" type="date" defaultValue={lead.next_action_at ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </div>
      <Field label="Notiz zum Gespräch">
        <textarea name="note" rows={3} maxLength={4000} placeholder="Was wurde besprochen? Was ist der nächste Schritt?" className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>
      <div>
        <button type="submit" disabled={pending} className={`${BTN} cp-btn-primary`}>
          {pending ? 'Wird gespeichert …' : 'Speichern'}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}

export function MasterDataForm({ lead }: { lead: SalesLead }) {
  const [state, action, pending] = useActionState(updateLeadAction.bind(null, lead.id), initial)
  return (
    <form action={action} className="flex flex-col gap-4">
      <MasterDataFields lead={lead} />
      <div>
        <button type="submit" disabled={pending} className={`${BTN} cp-btn-secondary`}>
          {pending ? 'Wird gespeichert …' : 'Stammdaten speichern'}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}

export function AssignForm({ lead, members }: { lead: SalesLead; members: SalesMember[] }) {
  const [state, action, pending] = useActionState(assignLeadAction.bind(null, lead.id), initial)
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="Zuständig">
          <select name="owner_user_id" defaultValue={lead.owner_user_id ?? ''} className={INPUT_CLASS} style={INPUT_STYLE}>
            <option value="">Nicht verteilt</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
        </Field>
      </div>
      <button type="submit" disabled={pending} className={`${BTN} cp-btn-secondary`}>
        {pending ? 'Wird zugewiesen …' : 'Zuweisen'}
      </button>
      <Feedback state={state} />
    </form>
  )
}
