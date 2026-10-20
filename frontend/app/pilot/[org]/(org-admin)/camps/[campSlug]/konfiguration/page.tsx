import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import CampConfigScreen from '../../../../../../components/saas/screens/CampConfigScreen'

export default async function CampConfigPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp } = await loadCampAdminData(orgSlug, campSlug)

  return <CampConfigScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} />
}
