'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchMe, updateOrganizationAdmin } from '../../../lib/saasAdminApi'

export interface BillingActionState {
  error: string | null
  saved: boolean
}

export async function updateBillingNotesAction(
  orgSlug: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }

  const notes = formData.get('billing_notes')
  if (typeof notes !== 'string') return { error: 'Bitte Konditionen eingeben.', saved: false }

  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Konditionen bearbeiten.', saved: false }
    await updateOrganizationAdmin(orgSlug, token, { billing_notes: notes.trim() || null })
  } catch {
    return { error: 'Konditionen konnten nicht gespeichert werden.', saved: false }
  }

  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}