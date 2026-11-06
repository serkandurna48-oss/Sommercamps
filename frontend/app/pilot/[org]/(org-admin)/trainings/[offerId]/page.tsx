import { loadTrainingOffer } from '../../../../../components/saas/trainingAdminData'
import TrainingOfferScreen from '../../../../../components/saas/screens/TrainingOfferScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Training' }

export default async function TrainingOfferPage({ params, searchParams }: {
  params: Promise<{ org: string; offerId: string }>
  searchParams?: Promise<{ neu?: string | string[] }>
}) {
  const { org: orgSlug, offerId } = await params
  const query = await searchParams
  const data = await loadTrainingOffer(orgSlug, offerId)
  return <TrainingOfferScreen orgSlug={orgSlug} {...data} justCreated={query?.neu === '1'} />
}
