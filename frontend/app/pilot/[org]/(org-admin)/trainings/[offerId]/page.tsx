import { isModuleDisabled, loadTrainingOffer } from '../../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../../components/saas/screens/ModuleDisabledScreen'
import TrainingOfferScreen from '../../../../../components/saas/screens/TrainingOfferScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Training' }

export default async function TrainingOfferPage({ params, searchParams }: {
  params: Promise<{ org: string; offerId: string }>
  searchParams?: Promise<{ neu?: string | string[] }>
}) {
  const { org: orgSlug, offerId } = await params
  if (await isModuleDisabled(orgSlug, 'trainings')) return <ModuleDisabledScreen orgSlug={orgSlug} module="trainings" />
  const query = await searchParams
  const data = await loadTrainingOffer(orgSlug, offerId)
  return <TrainingOfferScreen orgSlug={orgSlug} {...data} justCreated={query?.neu === '1'} />
}
