'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../../../lib/adminSession'

export async function logoutAction(orgSlug: string) {
  const store = await cookies()
  const accessToken = store.get(ADMIN_TOKEN_COOKIE)?.value

  if (accessToken) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && anonKey) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      }).catch(() => undefined)
    }
  }

  store.delete({ name: ADMIN_TOKEN_COOKIE, path: '/' })
  store.delete({ name: REFRESH_TOKEN_COOKIE, path: '/' })
  redirect(`/pilot/${orgSlug}/login`)
}
