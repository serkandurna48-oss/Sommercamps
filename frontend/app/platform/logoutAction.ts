'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_TOKEN_COOKIE } from '../lib/adminSession'

export async function platformLogoutAction() {
  const store = await cookies()
  store.delete({ name: ADMIN_TOKEN_COOKIE, path: '/' })
  redirect('/platform/login')
}
