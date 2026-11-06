import { isModuleDisabled, loadTrainingOffers } from '../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../components/saas/screens/ModuleDisabledScreen'
import TrainingsScreen from '../../../../components/saas/screens/TrainingsScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Trainings' }

export default async function TrainingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  if (await isModuleDisabled(orgSlug, 'trainings')) return <ModuleDisabledScreen orgSlug={orgSlug} module="trainings" />
  const { org, offers } = await loadTrainingOffers(orgSlug)
  return <TrainingsScreen orgSlug={orgSlug} org={org} offers={offers} />
}
