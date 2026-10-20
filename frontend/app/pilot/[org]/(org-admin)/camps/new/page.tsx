import { notFound, redirect } from 'next/navigation'
import { getAdminToken } from '../../../../../lib/adminSession'
import { getOrganizationAdmin } from '../../../../../components/saas/orgAdminData'
import CampCreateScreen from '../../../../../components/saas/screens/CampCreateScreen'

export default async function NewCampPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  return <CampCreateScreen orgSlug={orgSlug} org={org} />
}
