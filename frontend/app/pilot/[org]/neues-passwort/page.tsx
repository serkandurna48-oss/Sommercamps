import type { Metadata } from 'next'
import AuthPage from '../login/AuthPage'
import NewPasswordForm from './NewPasswordForm'

export const metadata: Metadata = { title: 'Neues Passwort setzen – CampsPilot', referrer: 'no-referrer' }

export default async function NewPasswordPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return <AuthPage orgSlug={org}><NewPasswordForm orgSlug={org} /></AuthPage>
}
