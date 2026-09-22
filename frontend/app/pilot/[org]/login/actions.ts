'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE } from '../../../lib/adminSession'
import { adminLogin } from '../../../lib/saasAdminApi'

export interface LoginState {
  error: string | null
}

export async function loginAction(orgSlug: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '')
  if (!password) {
    return { error: 'Bitte Passwort eingeben.' }
  }

  let session
  try {
    session = await adminLogin(password)
  } catch {
    return { error: 'Anmeldung fehlgeschlagen. Passwort prüfen und erneut versuchen.' }
  }

  const store = await cookies()
  store.set(ADMIN_TOKEN_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/pilot',
    maxAge: session.expiresInHours * 3600,
  })

  redirect(`/pilot/${orgSlug}/dashboard`)
}
