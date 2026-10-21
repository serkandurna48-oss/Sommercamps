import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import CampTasksScreen from '../../../../../../components/saas/screens/CampTasksScreen'

export default async function CampTasksPage({ params }: { params: Promise<{ org: string; campSlug: string }> }) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)
  return <CampTasksScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} />
}
