import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { readableTextOn } from '../../lib/readableTextOn'
import { getPublicCamps, getPublicOrganization } from './publicData'
import { filterFutureCamps } from './campUtils'
import CampStructuredData from './CampStructuredData'
import GrainOverlay from './GrainOverlay'
import ParentFlow from './ParentFlow'
import PublicLoadError from './PublicLoadError'
import { publicFontClassName } from './publicFonts'
import { clubMetadata, getSiteUrl, neutralMetadata } from './socialMetadata'
import './publicTheme.css'

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

// Muss mit --surface je Theme in publicTheme.css übereinstimmen (Ticket §5:
// Ground für die Kontrast-Pipeline ist --surface des aktiven Themes).
const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
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
  const [orgOutcome, campsOutcome] = await Promise.allSettled([
    getPublicOrganization(orgSlug),
    getPublicCamps(orgSlug),
  ])

  if (orgOutcome.status === 'rejected') return <PublicLoadError />
  const org = orgOutcome.value
  if (!org) notFound()

  if (campsOutcome.status === 'rejected') return <PublicLoadError org={org} />
  const allCamps = campsOutcome.value
  const camps = filterFutureCamps(allCamps)
  const hadPastCamps = allCamps.length > 0 && camps.length === 0
  const ground = THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition
  const brand = computeBrandSafe(org.primary_color, ground)

  return (
    <div
      className={`cp-public ${publicFontClassName(org.theme)}`}
      data-theme={org.theme}
      style={
        {
          '--brand': brand.brand,
          '--brand-strong': brand.strong,
          '--brand-on': brand.on,
          '--on-primary': readableTextOn(brand.brand),
        } as React.CSSProperties
      }
    >
      <CampStructuredData org={org} camps={allCamps} />
      <GrainOverlay />
      <div className="app">
        <ParentFlow org={org} camps={camps} hadPastCamps={hadPastCamps} initialCampSlug={typeof selectedSlug === 'string' ? selectedSlug : undefined} />
      </div>
    </div>
  )
}
