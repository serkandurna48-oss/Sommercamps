import { loadClubMembers, parseMemberStatus } from '../../../../components/saas/trainingAdminData'
import MembersScreen from '../../../../components/saas/screens/MembersScreen'

export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ org: string }>
  searchParams?: Promise<{ q?: string | string[]; status?: string | string[] }>
}) {
  const { org: orgSlug } = await params
  const query = await searchParams
  const q = typeof query?.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const status = parseMemberStatus(query?.status)
  const { org, members } = await loadClubMembers(orgSlug, { q, status })
  return <MembersScreen orgSlug={orgSlug} org={org} members={members} q={q} status={status} />
}
