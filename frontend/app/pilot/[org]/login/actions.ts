'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../../../lib/adminSession'
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
    return { error: 'Bitte geben Sie Ihre E-Mail-Adresse und Ihr Passwort ein.' }
  }

  let accessToken: string
  let expiresIn: number
  let refreshToken: string
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie Ihre E-Mail-Adresse und Ihr Passwort sowie die Bestätigung Ihrer E-Mail-Adresse. Versuchen Sie es anschließend erneut.' }
    }
    accessToken = data.session.access_token
    expiresIn = data.session.expires_in
    refreshToken = data.session.refresh_token
  } catch {
    return { error: 'Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es später erneut.' }
  }

  const store = await cookies()
  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
  store.set(ADMIN_TOKEN_COOKIE, accessToken, { ...cookieBase, maxAge: expiresIn })
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 })

  // The platform layout resolves the authenticated user's own club when no slug is known.
  redirect(orgSlug ? `/pilot/${orgSlug}/dashboard` : '/platform')
}
