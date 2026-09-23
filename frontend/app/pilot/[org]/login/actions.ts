'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE } from '../../../lib/adminSession'
import { getSupabaseServerClient } from '../../../lib/supabaseServer'

export interface LoginState {
  error: string | null
}

/** Seit feat/platform-foundation: echte Supabase-Auth-Accounts statt eines
 * einzelnen ADMIN_PASSWORD. `orgSlug` bestimmt nur, wohin nach dem Login
 * weitergeleitet wird — ob dieser Account diesen Verein tatsächlich
 * verwalten darf, entscheidet ausschließlich das Backend bei jedem
 * folgenden Request (app/auth_deps.py::require_org_access), nie diese
 * Server Action. Ein platform_owner UND ein org_admin dieses Vereins
 * können sich hier gleichermaßen einloggen — beides ist ein gültiges
 * Konto, nur mit unterschiedlicher Reichweite. */
export async function loginAction(orgSlug: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) {
    return { error: 'Bitte E-Mail und Passwort eingeben.' }
  }

  let accessToken: string
  let expiresIn: number
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return { error: 'Anmeldung fehlgeschlagen. E-Mail/Passwort prüfen und erneut versuchen.' }
    }
    accessToken = data.session.access_token
    expiresIn = data.session.expires_in
  } catch {
    return { error: 'Anmeldung derzeit nicht möglich — Supabase Auth ist nicht konfiguriert.' }
  }

  const store = await cookies()
  store.set(ADMIN_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: expiresIn,
  })

  redirect(`/pilot/${orgSlug}/dashboard`)
}
