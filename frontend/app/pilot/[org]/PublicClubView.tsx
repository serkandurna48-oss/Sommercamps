import type { CSSProperties } from 'react'
import AnalyticsConsentBanner from '../AnalyticsConsent'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { readableTextOn } from '../../lib/readableTextOn'
import type { CampPublic, OrganizationPublic, TrainingOfferListItem } from '../../lib/saasApi'
import { withDefaultDesign } from './defaultDesign'
import CampStructuredData from './CampStructuredData'
import GrainOverlay from './GrainOverlay'
import ParentFlow from './ParentFlow'
import { publicFontClassName } from './publicFonts'
import './publicTheme.css'
import './training/trainingPages.css'

// Muss mit --surface je Theme in publicTheme.css übereinstimmen (Ticket §5:
// Ground für die Kontrast-Pipeline ist --surface des aktiven Themes).
const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

/**
 * The themed public club page (hero, camps, how it works, footer). Shared by the real
 * /pilot/[org] route and the static demo at /demo/verein, so the demo shows the real design.
 * `demo` switches off structured data and analytics, and keeps the registration form local.
 */
export default function PublicClubView({ org: storedOrg, allCamps, camps, pastCamps = [], trainings, hadPastCamps, initialCampSlug, demo = false }: {
  org: OrganizationPublic
  /** Every camp incl. past ones (structured data only). */
  allCamps: CampPublic[]
  camps: CampPublic[]
  /** Past camps: collapsed archive, clickable, no registration. */
  pastCamps?: CampPublic[]
  trainings: TrainingOfferListItem[]
  hadPastCamps: boolean
  initialCampSlug?: string
  demo?: boolean
}) {
  const org = withDefaultDesign(storedOrg)
  const ground = THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition
  const brand = computeBrandSafe(org.primary_color, ground)
  const flow = <ParentFlow org={org} camps={camps} pastCamps={pastCamps} trainings={trainings} hadPastCamps={hadPastCamps} initialCampSlug={initialCampSlug} demo={demo} />

  return (
    <div
      className={`cp-public ${publicFontClassName(org.theme)}`}
      data-theme={org.theme}
      data-org={org.slug}
      style={
        {
          '--brand': brand.brand,
          '--brand-strong': brand.strong,
          '--brand-on': brand.on,
          '--on-primary': readableTextOn(brand.brand),
        } as CSSProperties
      }
    >
      {!demo && <CampStructuredData org={org} camps={allCamps} />}
      <GrainOverlay />
      <div className="app">{flow}</div>
      {/* Inside the themed wrapper so the banner uses the club's colors and fonts. */}
      {!demo && <AnalyticsConsentBanner orgSlug={org.slug} isLanding />}
    </div>
  )
}
