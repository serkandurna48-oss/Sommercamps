'use server'

import { getAdminToken } from '../../../lib/adminSession'
import { AdminActionError, submitReviewAdmin } from '../../../lib/saasAdminApi'

export async function submitReviewAction(
  orgSlug: string,
  avvVersion: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getAdminToken()
  if (!token) return { ok: false, error: 'Nicht angemeldet.' }
  try {
    await submitReviewAdmin(orgSlug, token, avvVersion)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminActionError ? err.message : 'Einreichung nicht möglich. Bitte versuchen Sie es erneut.',
    }
  }
}
