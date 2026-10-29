export const RESET_CONFIRMATION = 'Wenn ein Konto zu dieser E-Mail existiert, haben wir Ihnen einen Link geschickt.'
export const INVALID_RECOVERY_LINK = 'Dieser Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.'

export interface RecoverySession {
  access_token: string
  refresh_token: string
}

/** The existing Supabase client uses the implicit flow, returning tokens in the fragment. */
export function readRecoverySession(hash: string): RecoverySession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (params.has('error') || params.has('error_code') || params.get('type') !== 'recovery' || !access_token || !refresh_token) return null
  return { access_token, refresh_token }
}

export interface PasswordState {
  error: string | null
  success: boolean
}

export const initialPasswordState: PasswordState = { error: null, success: false }
