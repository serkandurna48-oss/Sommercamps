import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import CampsScreen from '../../../../components/saas/screens/CampsScreen'

export default async function CampsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)
  return <CampsScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}
