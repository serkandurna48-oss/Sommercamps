import { loadOrgAdminData, loadTrainingPayments } from '../../../../components/saas/orgAdminData'
import { loadTrainingOverview } from '../../../../components/saas/trainingAdminData'
import OrgDashboardScreen from '../../../../components/saas/screens/OrgDashboardScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Übersicht' }

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  // Camps, trainings and training payments load in parallel; the training parts never block the camp dashboard.
  const [{ org, camps, registrationsByCamp }, training, payments] = await Promise.all([
    loadOrgAdminData(orgSlug),
    loadTrainingOverview(orgSlug),
    loadTrainingPayments(orgSlug),
  ])

  return <OrgDashboardScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} training={training}
    trainingPayments={payments.trainingPayments} trainingPaymentsError={payments.trainingPaymentsError} />
}
