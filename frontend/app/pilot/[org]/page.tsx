import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicCamps, getPublicOrganization, getPublicTrainingOffers } from './publicData'
import { hasModule } from '../../lib/orgModules'
import { filterFutureCamps } from './campUtils'
import PublicClubView from './PublicClubView'
import PublicLoadError from './PublicLoadError'
import { clubMetadata, getSiteUrl, neutralMetadata } from './socialMetadata'

type PageProps = {
  params: Promise<{ org: string }>
  searchParams?: Promise<{ camp?: string | string[] }>
}

/** Override the legacy root metadata for public club and camp links. */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { org: orgSlug } = await params
  const selectedSlug = (await searchParams)?.camp
  try {
    const org = await getPublicOrganization(orgSlug)
    if (!org) return neutralMetadata
    const camp = typeof selectedSlug === 'string'
      ? (await getPublicCamps(orgSlug)).find(camp => camp.slug === selectedSlug)
      : undefined
    return clubMetadata(org, getSiteUrl(), camp)
  } catch {
    return neutralMetadata
  }
}

/** Trainings sind ergänzend: jeder Fehler (auch synchron) wird zur leeren Liste. */
async function loadTrainingOffers(orgSlug: string) {
  try {
    return await getPublicTrainingOffers(orgSlug)
  } catch {
    return []
  }
}

/**
 * CP-S408/Eltern-Flow-Auftrag — CampsPilot SaaS staging pilot flow.
 *
 * Deliberately separate from `/` (KSV/JK legacy flow): different backend
 * (backend_saas via NEXT_PUBLIC_SAAS_API_URL, not NEXT_PUBLIC_API_URL),
 * different data model (see app/lib/saasApi.ts). Does not read or affect
 * clubConfig.tsx, RegistrationForm.tsx, or anything under `/`.
 *
 * `cache: 'no-store'` in saasApi.ts keeps this route fully dynamic — no
 * network access at build time, and always reflects current capacity/
 * waitlist state.
 *
 * `data-theme` sitzt auf diesem Wrapper, nicht auf `<html>` (§3.2) — das
 * Org-Admin-Dashboard unter (org-admin)/ bleibt davon unberührt.
 */
export default async function PilotOrgPage({ params, searchParams }: PageProps) {
  const { org: orgSlug } = await params
  const selectedSlug = (await searchParams)?.camp
  const [orgOutcome, campsOutcome, trainingsOutcome] = await Promise.allSettled([
    getPublicOrganization(orgSlug),
    getPublicCamps(orgSlug),
    loadTrainingOffers(orgSlug),
  ])

  if (orgOutcome.status === 'rejected') return <PublicLoadError />
  const org = orgOutcome.value
  if (!org) notFound()

  if (campsOutcome.status === 'rejected') return <PublicLoadError org={org} />
  const allCamps = campsOutcome.value
  const camps = filterFutureCamps(allCamps)
  // Ein Fehler beim Laden der Trainings darf die Camp-Seite nicht beeinträchtigen.
  // Ohne Trainings-Modul gibt es keinen Trainingsbereich (die API antwortet dann ohnehin 404).
  const trainings = hasModule(org, 'trainings') && trainingsOutcome.status === 'fulfilled' && Array.isArray(trainingsOutcome.value) ? trainingsOutcome.value : []
  const hadPastCamps = allCamps.length > 0 && camps.length === 0
  return (
    <PublicClubView
      org={org}
      allCamps={allCamps}
      camps={camps}
      trainings={trainings}
      hadPastCamps={hadPastCamps}
      initialCampSlug={typeof selectedSlug === 'string' ? selectedSlug : undefined}
    />
  )
}
