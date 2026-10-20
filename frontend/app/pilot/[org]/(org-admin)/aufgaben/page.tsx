import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import OrgTasksScreen from '../../../../components/saas/screens/OrgTasksScreen'

export default async function OrgTasksPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  return <OrgTasksScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}
