import { isModuleDisabled, loadTrainingOrg } from '../../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../../components/saas/screens/ModuleDisabledScreen'
import TrainingOfferCreateScreen from '../../../../../components/saas/screens/TrainingOfferCreateScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Angebot anlegen' }

export default async function NewTrainingOfferPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  if (await isModuleDisabled(orgSlug, 'trainings')) return <ModuleDisabledScreen orgSlug={orgSlug} module="trainings" />
  const org = await loadTrainingOrg(orgSlug)
  return <TrainingOfferCreateScreen orgSlug={orgSlug} org={org} />
}
