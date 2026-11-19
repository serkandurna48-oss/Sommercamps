'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminActionError, addSalesMember, updateSalesMember, type SalesRole } from '../../../lib/saasAdminApi'
import type { TeamActionState } from './teamActions'

const EXPIRED: TeamActionState = { error: 'Sitzung abgelaufen — bitte neu anmelden.', notice: null }

function role(value: FormDataEntryValue | null): SalesRole {
  return value === 'sales_lead' ? 'sales_lead' : 'sales_rep'
}

/** Invites (new address) or (re)activates a sales account. Re-inviting an
 * account that never signed in sends a fresh set-password link. */
export async function addSalesMemberAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED
  const email = String(formData.get('email') ?? '').trim()
  const displayName = String(formData.get('display_name') ?? '').trim()
  if (!email || !displayName) return { error: 'Bitte Name und E-Mail-Adresse eingeben.', notice: null }
  try {
    const member = await addSalesMember(token, { email, display_name: displayName, role: role(formData.get('role')) })
    revalidatePath('/platform/team')
    if (member.invite_mail_sent === false) {
      return { error: null, notice: `${displayName} ist angelegt, aber die E-Mail ist nicht angekommen. Später erneut einladen.` }
    }
    return {
      error: null,
      notice: member.invited
        ? `Einladung an ${email} gesendet. Der Link zum Passwort-Festlegen ist 24 Stunden gültig.`
        : `${displayName} hat Vertriebszugang und wurde per E-Mail informiert.`,
    }
  } catch (err) {
    return { error: err instanceof AdminActionError ? err.message : 'Vertriebskonto konnte nicht angelegt werden.', notice: null }
  }
}

export async function updateSalesMemberAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED
  const userId = String(formData.get('user_id') ?? '')
  const change = String(formData.get('change') ?? '')
  const body = change === 'deactivate' ? { active: false } : change === 'activate' ? { active: true }
    : change === 'role' ? { role: role(formData.get('role')) } : null
  if (!userId || !body) return { error: 'Unbekannte Änderung.', notice: null }
  try {
    await updateSalesMember(token, userId, body)
  } catch (err) {
    return { error: err instanceof AdminActionError ? err.message : 'Vertriebskonto konnte nicht geändert werden.', notice: null }
  }
  revalidatePath('/platform/team')
  return { error: null, notice: 'Gespeichert.' }
}
