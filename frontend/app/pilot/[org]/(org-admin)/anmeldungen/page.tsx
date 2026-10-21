import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import NewRegistrationsScreen from '../../../../components/saas/screens/NewRegistrationsScreen'

export default async function NewRegistrationsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)
  return <NewRegistrationsScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}