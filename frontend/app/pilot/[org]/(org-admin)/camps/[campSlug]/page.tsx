import { loadCampAdminData } from '../../../../../components/saas/orgAdminData'
import CampDetailScreen from '../../../../../components/saas/screens/CampDetailScreen'

export default async function CampCommandCenterPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

  return <CampDetailScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} />
}
