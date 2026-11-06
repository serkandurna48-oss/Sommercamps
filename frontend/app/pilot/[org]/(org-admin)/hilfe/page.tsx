import { redirect } from 'next/navigation'
import HilfeScreen from '../../../../components/saas/screens/HilfeScreen'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'
import { getValidAccessToken } from '../../../../lib/supabaseServer'
import { AdminAuthError } from '../../../../lib/saasAdminApi'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Hilfe' }

export default async function HilfePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token).catch(err => {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  })
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  return <HilfeScreen orgSlug={orgSlug} org={org} />
}
