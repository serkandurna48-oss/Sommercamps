'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getValidAccessToken } from '../../lib/supabaseServer'
import { AdminActionError, assignSalesLead, createSalesLead, updateSalesLead } from '../../lib/saasAdminApi'
import { STATUS_ORDER } from '../labels'

export interface LeadFormState {
  error: string | null
  notice: string | null
}

const EXPIRED: LeadFormState = { error: 'Sitzung abgelaufen — bitte neu anmelden.', notice: null }
const TEXT_FIELDS = ['name', 'city', 'website', 'contact_name', 'phone', 'email', 'source_url'] as const

function message(err: unknown, fallback: string): LeadFormState {
  return { error: err instanceof AdminActionError ? err.message : fallback, notice: null }
}

/** Only known fields are forwarded; ownership and roles are never sent from
 * here (the backend rejects them anyway). Empty text clears a field. */
function leadFields(formData: FormData, { clearEmpty }: { clearEmpty: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of TEXT_FIELDS) {
    if (!formData.has(field)) continue
    const value = String(formData.get(field) ?? '').trim()
    if (value) body[field] = value
    else if (clearEmpty && field !== 'name') body[field] = null
  }
  const kind = String(formData.get('kind') ?? '')
  if (['verein', 'fussballschule', 'sonstige'].includes(kind)) body.kind = kind
  if (formData.has('fit')) {
    const fit = String(formData.get('fit') ?? '')
    body.fit = ['A', 'B', 'C'].includes(fit) ? fit : null
  }
  if (formData.has('next_action_at')) {
    const date = String(formData.get('next_action_at') ?? '')
    body.next_action_at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  }
  return body
}

export async function createLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED
  const body = leadFields(formData, { clearEmpty: false })
  if (!body.name) return { error: 'Bitte einen Namen eingeben.', notice: null }
  const note = String(formData.get('note') ?? '').trim()
  if (note) body.note = note
  let id: string
  try {
    id = (await createSalesLead(token, body)).id
  } catch (err) {
    return message(err, 'Lead konnte nicht angelegt werden.')
  }
  revalidatePath('/vertrieb')
  redirect(`/vertrieb/${id}`)
}

export async function updateLeadAction(leadId: string, _prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED
  const body = leadFields(formData, { clearEmpty: true })
  const status = String(formData.get('status') ?? '')
  if (STATUS_ORDER.includes(status as never)) body.status = status
  const note = String(formData.get('note') ?? '').trim()
  if (note) body.note = note
  if ('name' in body && !body.name) return { error: 'Name darf nicht leer sein.', notice: null }
  try {
    await updateSalesLead(token, leadId, body)
  } catch (err) {
    return message(err, 'Änderung konnte nicht gespeichert werden.')
  }
  revalidatePath(`/vertrieb/${leadId}`)
  revalidatePath('/vertrieb')
  return { error: null, notice: 'Gespeichert.' }
}

export async function assignLeadAction(leadId: string, _prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED
  const owner = String(formData.get('owner_user_id') ?? '')
  try {
    await assignSalesLead(token, leadId, owner || null)
  } catch (err) {
    return message(err, 'Zuweisung konnte nicht gespeichert werden.')
  }
  revalidatePath(`/vertrieb/${leadId}`)
  revalidatePath('/vertrieb')
  return { error: null, notice: owner ? 'Zugewiesen.' : 'Zuweisung aufgehoben.' }
}
