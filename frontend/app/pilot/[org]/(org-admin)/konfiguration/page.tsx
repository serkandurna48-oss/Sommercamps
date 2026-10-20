import { notFound, redirect } from 'next/navigation'
import { getAdminToken } from '../../../../lib/adminSession'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'
import OrgConfigScreen from '../../../../components/saas/screens/OrgConfigScreen'

export default async function OrgConfigPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  return <OrgConfigScreen orgSlug={orgSlug} org={org} />
}
