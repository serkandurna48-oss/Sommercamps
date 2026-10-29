'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { addOrganizationMemberAdmin, removeOrganizationMemberAdmin } from '../../../lib/saasAdminApi'

export interface AddMemberState {
  error: string | null
  notice: string | null
}

/** Fügt einen Vereinsadmin per E-Mail hinzu. Unbekannte Adressen bekommen
 * eine Einladung mit Link zum Passwort-Festlegen, bestehende Konten eine
 * Info-Mail mit Login-Link (siehe Backend add_organization_member). */
export async function addOrganizationMemberAction(
  orgSlug: string,
  _prev: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', notice: null }

  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Bitte E-Mail-Adresse eingeben.', notice: null }

  let member
  try {
    member = await addOrganizationMemberAdmin(orgSlug, token, email)
  } catch (err) {
    if (err instanceof Error) return { error: err.message, notice: null }
    return { error: 'Zugriff konnte nicht zugewiesen werden.', notice: null }
  }

  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, notice: memberNotice(email, member.invited === true, member.invite_mail_sent !== false) }
}

export async function removeOrganizationMemberAction(orgSlug: string, memberId: string): Promise<void> {
  const token = await getValidAccessToken()
  if (!token) return
  await removeOrganizationMemberAdmin(orgSlug, memberId, token).catch(() => undefined)
  revalidatePath(`/platform/${orgSlug}`)
}

function memberNotice(email: string, invited: boolean, mailSent: boolean): string {
  if (!mailSent) {
    return `${email} hat Zugriff, aber die E-Mail ist nicht angekommen. Bitte „Passwort vergessen?“ auf der Vereins-Anmeldeseite nutzen lassen.`
  }
  return invited
    ? `Einladung an ${email} gesendet. Der Link zum Passwort-Festlegen ist 24 Stunden gültig.`
    : `${email} hat jetzt Zugriff und wurde per E-Mail informiert.`
}
