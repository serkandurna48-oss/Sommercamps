import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasModule } from '../../../../lib/orgModules'
import LegalShell from '../../LegalShell'
import PublicLoadError from '../../PublicLoadError'
import { getPublicOrganization, getPublicTrainingOffer } from '../../publicData'
import TrainingOfferFlow from '../TrainingOfferFlow'
import { neutralTrainingMetadata, trainingOfferMetadata } from '../trainingMetadata'

type PageProps = { params: Promise<{ org: string; offerSlug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { org: orgSlug, offerSlug } = await params
  try {
    const [org, offer] = await Promise.all([getPublicOrganization(orgSlug), getPublicTrainingOffer(orgSlug, offerSlug)])
    return org && offer ? trainingOfferMetadata(org, offer) : neutralTrainingMetadata
  } catch {
    return neutralTrainingMetadata
  }
}

/** Angebotsdetail mit Terminen und Buchung; der Link wird per WhatsApp geteilt. */
export default async function TrainingOfferPage({ params }: PageProps) {
  const { org: orgSlug, offerSlug } = await params
  const [orgOutcome, offerOutcome] = await Promise.allSettled([
    getPublicOrganization(orgSlug),
    getPublicTrainingOffer(orgSlug, offerSlug),
  ])
  if (orgOutcome.status === 'rejected') return <PublicLoadError title="Training gerade nicht erreichbar" message="Das Trainingsangebot konnte nicht geladen werden." />
  const org = orgOutcome.value
  if (!org) notFound()
  // Trainings module off: the training pages do not exist for this club.
  if (!hasModule(org, 'trainings')) notFound()
  if (offerOutcome.status === 'rejected') return <PublicLoadError org={org} title="Training gerade nicht erreichbar" message="Das Trainingsangebot konnte nicht geladen werden." />
  const offer = offerOutcome.value
  if (!offer) notFound()

  return (
    <LegalShell org={org}>
      <main lang="de">
        <TrainingOfferFlow org={org} initialOffer={offer} />
      </main>
    </LegalShell>
  )
}
