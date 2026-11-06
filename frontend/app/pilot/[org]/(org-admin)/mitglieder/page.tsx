import { loadClubMembers } from '../../../../components/saas/trainingAdminData'
import MembersScreen from '../../../../components/saas/screens/MembersScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mitglieder' }

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, members } = await loadClubMembers(orgSlug)
  return <MembersScreen orgSlug={orgSlug} org={org} members={members} />
}
