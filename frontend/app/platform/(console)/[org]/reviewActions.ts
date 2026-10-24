'use server'

import { de } from '../../../lib/i18n/de'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
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
  const token = await getValidAccessToken()
  if (!token) return { error: de.adminActions.sessionExpired, done: false, decision: null }

  const decision = formData.get('decision') as 'approve' | 'reject'
  const note = (formData.get('note') as string | null) ?? ''

  if (decision === 'reject' && note.trim().length < 10) {
    return { error: de.adminActions.reviewNote, done: false, decision: null }
  }

  try {
    await reviewOrganization(orgSlug, decision, token, note.trim() || undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : de.adminApi.reviewSave
    return { error: msg, done: false, decision: null }
  }

  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, done: true, decision }
}
