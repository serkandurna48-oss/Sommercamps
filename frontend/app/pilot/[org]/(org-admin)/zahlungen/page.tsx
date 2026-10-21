import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import OrgPaymentsScreen from '../../../../components/saas/screens/OrgPaymentsScreen'

export default async function OrgPaymentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  return <OrgPaymentsScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}
