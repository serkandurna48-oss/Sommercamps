'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { reviewOrganization } from '../../../lib/saasAdminApi'

export interface ReviewActionState {
  error: string | null
  done: boolean
  decision: 'approve' | 'reject' | null
}

export async function reviewOrganizationAction(
  orgSlug: string,
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', done: false, decision: null }

  const decision = formData.get('decision') as 'approve' | 'reject'
  const note = (formData.get('note') as string | null) ?? ''

  if (decision === 'reject' && note.trim().length < 10) {
    return { error: 'Bitte gib einen Ablehnungsgrund ein (min. 10 Zeichen).', done: false, decision: null }
  }

  try {
    await reviewOrganization(orgSlug, decision, token, note.trim() || undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Freigabe konnte nicht gespeichert werden'
    return { error: msg, done: false, decision: null }
  }

  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, done: true, decision }
}
