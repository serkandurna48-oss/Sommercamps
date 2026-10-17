'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE } from '../../../lib/adminSession'

export async function logoutAction(orgSlug: string) {
  const store = await cookies()
  store.delete({ name: ADMIN_TOKEN_COOKIE, path: '/' })
  redirect(`/pilot/${orgSlug}/login`)
}
