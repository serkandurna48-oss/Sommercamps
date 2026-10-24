import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import CampConfigScreen from '../../../../../../components/saas/screens/CampConfigScreen'

export default async function CampConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; campSlug: string }>
  searchParams: Promise<{ created?: string; duplicate?: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { created, duplicate } = await searchParams
  const { org, camp } = await loadCampAdminData(orgSlug, campSlug)

  return <CampConfigScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} created={created === '1'} duplicate={duplicate === '1' || duplicate === 'incomplete' ? duplicate : undefined} />
}
