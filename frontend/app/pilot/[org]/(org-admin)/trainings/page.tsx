import { loadTrainingOffers } from '../../../../components/saas/trainingAdminData'
import TrainingsScreen from '../../../../components/saas/screens/TrainingsScreen'

export default async function TrainingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, offers } = await loadTrainingOffers(orgSlug)
  return <TrainingsScreen orgSlug={orgSlug} org={org} offers={offers} />
}
