import type { Metadata } from 'next'
import { fetchOrganization } from '../../../lib/saasApi'
import AuthPage from './AuthPage'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Anmelden – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function AdminLoginPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  return AuthPage({ orgSlug })
}
