'use server'

import { getSupabaseServerClient } from '../../../lib/supabaseServer'
import { INVALID_RECOVERY_LINK, type PasswordState, type RecoverySession } from '../passwort-vergessen/recovery'

export async function setNewPassword(session: RecoverySession | null, _prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('passwordConfirmation') ?? '')
  if (password.length < 10) return { error: 'Das Passwort muss mindestens 10 Zeichen lang sein.', success: false }
  if (password !== confirmation) return { error: 'Die Passwörter stimmen nicht überein. Bitte prüfen Sie Ihre Eingaben.', success: false }
  if (!session?.access_token || !session?.refresh_token) return { error: INVALID_RECOVERY_LINK, success: false }

  try {
    // A fresh, non-persistent client prevents mixing this link with another login session.
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.setSession(session)
    if (error || !data.session) return { error: INVALID_RECOVERY_LINK, success: false }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      if (updateError.code === 'same_password') return { error: 'Bitte wählen Sie ein anderes Passwort als Ihr bisheriges.', success: false }
      if (updateError.code === 'weak_password') return { error: 'Bitte wählen Sie ein stärkeres Passwort mit mindestens 10 Zeichen.', success: false }
      if (updateError.status === 401 || updateError.status === 403 || updateError.code === 'session_not_found') {
        return { error: INVALID_RECOVERY_LINK, success: false }
      }
      return { error: 'Das Passwort konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.', success: false }
    }
    return { error: null, success: true }
  } catch {
    return { error: 'Das Passwort konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.', success: false }
  }
}
