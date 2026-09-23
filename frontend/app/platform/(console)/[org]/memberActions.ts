'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { addOrganizationMemberAdmin, removeOrganizationMemberAdmin } from '../../../lib/saasAdminApi'

export interface AddMemberState {
  error: string | null
}

/** Weist ein bestehendes Supabase-Auth-Konto per E-Mail als org_admin zu
 * — kein Einladungs-Flow (kein E-Mail-Versand, siehe Backend-Docstring).
 * Das Konto muss vorher über scripts/create_platform_user.py angelegt
 * worden sein. */
export async function addOrganizationMemberAction(
  orgSlug: string,
  _prev: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.' }

  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Bitte E-Mail-Adresse eingeben.' }

  try {
    await addOrganizationMemberAdmin(orgSlug, token, email)
  } catch (err) {
    if (err instanceof Error) return { error: err.message }
    return { error: 'Zugriff konnte nicht zugewiesen werden.' }
  }

  revalidatePath(`/platform/${orgSlug}`)
  return { error: null }
}

export async function removeOrganizationMemberAction(orgSlug: string, memberId: string): Promise<void> {
  const token = await getAdminToken()
  if (!token) return
  await removeOrganizationMemberAdmin(orgSlug, memberId, token).catch(() => undefined)
  revalidatePath(`/platform/${orgSlug}`)
}
