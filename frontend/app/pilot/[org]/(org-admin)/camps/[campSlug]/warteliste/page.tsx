import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import CampWaitlistScreen from '../../../../../../components/saas/screens/CampWaitlistScreen'

export default async function CampWaitlistPage({ params }: { params: Promise<{ org: string; campSlug: string }> }) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)
  return <CampWaitlistScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} />
}
