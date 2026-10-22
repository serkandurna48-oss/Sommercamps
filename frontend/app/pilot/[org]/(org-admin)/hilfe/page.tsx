import { redirect } from 'next/navigation'
import HilfeScreen from '../../../../components/saas/screens/HilfeScreen'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'
import { getAdminToken } from '../../../../lib/adminSession'
import { AdminAuthError } from '../../../../lib/saasAdminApi'

export default async function HilfePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token).catch(err => {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  })
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  return <HilfeScreen orgSlug={orgSlug} org={org} />
}
