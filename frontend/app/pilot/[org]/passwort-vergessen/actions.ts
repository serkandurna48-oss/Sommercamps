'use server'

import { getSupabaseServerClient } from '../../../lib/supabaseServer'
import { authRedirectOrigin } from './redirectOrigin'
import { RESET_CONFIRMATION } from './recovery'

export async function requestPasswordReset(orgSlug: string, _prev: { message: string }, formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get('email') ?? '').trim()
  try {
    const redirectTo = new URL(`/pilot/${encodeURIComponent(orgSlug)}/neues-passwort`, authRedirectOrigin()).href
    const { error } = await getSupabaseServerClient().auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
  } catch {
    // Deliberately identical for unknown accounts, rate limits and delivery errors.
    return { message: RESET_CONFIRMATION }
  }
  return { message: RESET_CONFIRMATION }
}
