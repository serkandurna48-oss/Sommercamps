import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import OrgDashboardScreen from '../../../../components/saas/screens/OrgDashboardScreen'

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  return <OrgDashboardScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}
