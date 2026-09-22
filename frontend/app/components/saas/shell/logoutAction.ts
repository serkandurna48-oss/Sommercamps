'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE } from '../../../lib/adminSession'

export async function logoutAction(orgSlug: string) {
  const store = await cookies()
  store.delete(ADMIN_TOKEN_COOKIE)
  redirect(`/pilot/${orgSlug}/login`)
}
