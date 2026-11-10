import { isModuleDisabled, loadClubMember } from '../../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../../components/saas/screens/ModuleDisabledScreen'
import MemberDetailScreen from '../../../../../components/saas/screens/MemberDetailScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mitglied' }

export default async function MemberDetailPage({ params }: { params: Promise<{ org: string; memberId: string }> }) {
  const { org: orgSlug, memberId } = await params
  if (await isModuleDisabled(orgSlug, 'members')) return <ModuleDisabledScreen orgSlug={orgSlug} module="members" />
  const { org, member } = await loadClubMember(orgSlug, memberId)
  return <MemberDetailScreen orgSlug={orgSlug} org={org} member={member} />
}
