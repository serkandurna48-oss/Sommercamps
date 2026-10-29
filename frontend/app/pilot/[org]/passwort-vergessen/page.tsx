import type { Metadata } from 'next'
import AuthPage from '../login/AuthPage'
import ResetRequestForm from './ResetRequestForm'

export const metadata: Metadata = { title: 'Passwort vergessen – CampsPilot' }

export default async function PasswordResetPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return <AuthPage orgSlug={org}><ResetRequestForm orgSlug={org} /></AuthPage>
}
