import { loadOrgAdminData, loadTrainingPayments, type TrainingPaymentsResult } from '../../../../components/saas/orgAdminData'
import { isModuleDisabled, loadTrainingOverview, type TrainingOverview } from '../../../../components/saas/trainingAdminData'
import OrgDashboardScreen from '../../../../components/saas/screens/OrgDashboardScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Übersicht' }

const NO_TRAINING_PAYMENTS: TrainingPaymentsResult = { trainingPayments: [], trainingPaymentsError: false }

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  // Organisation is cached per request (layout): decides whether training data is loaded at all.
  const trainingsOff = await isModuleDisabled(orgSlug, 'trainings')
  // Camps, trainings and training payments load in parallel; the training parts never block the camp dashboard.
  const [{ org, camps, registrationsByCamp }, training, payments] = await Promise.all([
    loadOrgAdminData(orgSlug),
    trainingsOff ? Promise.resolve<TrainingOverview | undefined>(undefined) : loadTrainingOverview(orgSlug),
    trainingsOff ? Promise.resolve(NO_TRAINING_PAYMENTS) : loadTrainingPayments(orgSlug),
  ])

  return <OrgDashboardScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} training={training}
    trainingPayments={payments.trainingPayments} trainingPaymentsError={payments.trainingPaymentsError} />
}
