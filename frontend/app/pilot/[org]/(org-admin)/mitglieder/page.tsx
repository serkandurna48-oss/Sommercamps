import { isModuleDisabled, loadClubMembers } from '../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../components/saas/screens/ModuleDisabledScreen'
import MembersScreen from '../../../../components/saas/screens/MembersScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mitglieder' }

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  if (await isModuleDisabled(orgSlug, 'members')) return <ModuleDisabledScreen orgSlug={orgSlug} module="members" />
  const { org, members } = await loadClubMembers(orgSlug)
  return <MembersScreen orgSlug={orgSlug} org={org} members={members} />
}
