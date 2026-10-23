import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../../../lib/supabaseServer'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'
import OrgConfigScreen from '../../../../components/saas/screens/OrgConfigScreen'

export default async function OrgConfigPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  return <OrgConfigScreen orgSlug={orgSlug} org={org} />
}
