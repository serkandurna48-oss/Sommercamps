import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import { loadTrainingOverview } from '../../../../components/saas/trainingAdminData'
import OrgDashboardScreen from '../../../../components/saas/screens/OrgDashboardScreen'

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  // Camps and trainings load in parallel; the training part never blocks the camp dashboard.
  const [{ org, camps, registrationsByCamp }, training] = await Promise.all([
    loadOrgAdminData(orgSlug),
    loadTrainingOverview(orgSlug),
  ])

  return <OrgDashboardScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} training={training} />
}
