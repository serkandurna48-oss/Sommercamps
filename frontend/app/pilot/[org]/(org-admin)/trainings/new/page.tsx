import { loadTrainingOrg } from '../../../../../components/saas/trainingAdminData'
import TrainingOfferCreateScreen from '../../../../../components/saas/screens/TrainingOfferCreateScreen'

export default async function NewTrainingOfferPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await loadTrainingOrg(orgSlug)
  return <TrainingOfferCreateScreen orgSlug={orgSlug} org={org} />
}
