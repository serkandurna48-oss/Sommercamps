import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../../../../lib/supabaseServer'
import { getOrganizationAdmin } from '../../../../../components/saas/orgAdminData'
import CampCreateScreen from '../../../../../components/saas/screens/CampCreateScreen'
import { AdminAuthError, fetchCampsAdmin } from '../../../../../lib/saasAdminApi'
import { prefillCampDuplicate } from '../../../../../components/saas/config/campDuplicate'

export default async function NewCampPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams?: Promise<{ von?: string | string[] }> }) {
  const { org: orgSlug } = await params
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const query = await searchParams
  const sourceSlug = typeof query?.von === 'string' ? query.von : undefined
  let source
  if (sourceSlug) {
    try {
      source = (await fetchCampsAdmin(orgSlug, token)).find(camp => camp.slug === sourceSlug)
    } catch (error) {
      if (error instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
      throw error
    }
  }
  return <CampCreateScreen orgSlug={orgSlug} org={org} initialValues={source ? prefillCampDuplicate(source) : undefined} sourceMissing={Boolean(sourceSlug && !source)} />
}
