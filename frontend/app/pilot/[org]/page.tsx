import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { fetchCamps, fetchOrganization } from '../../lib/saasApi'
import GrainOverlay from './GrainOverlay'
import ParentFlow from './ParentFlow'
import { publicFontClassName } from './publicFonts'
import './publicTheme.css'

/**
 * Ohne dies erbt jede /pilot/[org]-Seite den Titel aus dem geteilten
 * Root-Layout (app/layout.tsx) — dort hart auf "KSV Baunatal –
 * Fußballschule" gesetzt, weil dieses Layout ursprünglich nur für die
 * KSV/JK-Seite existierte. Jeder SaaS-Verein zeigte dadurch bislang den
 * KSV-Titel im Browser-Tab an, unabhängig vom tatsächlichen Verein.
 */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? org.name : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
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
export default async function PilotOrgPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const camps = await fetchCamps(orgSlug)
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
        } as React.CSSProperties
      }
    >
      <GrainOverlay />
      <div className="app">
        <ParentFlow org={org} camps={camps} />
      </div>
    </div>
  )
}
