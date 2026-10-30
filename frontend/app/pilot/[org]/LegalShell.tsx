import type { ReactNode } from 'react'
import AnalyticsConsentBanner from '../AnalyticsConsent'
import Image from 'next/image'
import Link from 'next/link'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { readableTextOn } from '../../lib/readableTextOn'
import type { OrganizationPublic } from '../../lib/saasApi'
import { orgShortCode } from '../../lib/parentFlowFormat'
import GrainOverlay from './GrainOverlay'
import { publicFontClassName } from './publicFonts'
import PublicFooter from './PublicFooter'
import './publicTheme.css'

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

export default function LegalShell({ org, children }: { org: OrganizationPublic; children: ReactNode }) {
  const ground = THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition
  const brand = computeBrandSafe(org.primary_color, ground)
  const short = orgShortCode(org.name)

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
      <GrainOverlay />
      <AnalyticsConsentBanner orgSlug={org.slug} />
      <div className="app">
        <nav className="legal-nav" aria-label="Seitennavigation">
          <div className="nav-left">
            <span className="nav-logo-trad">
              {org.logo_url ? (
                <Image
                  src={org.logo_url}
                  alt={org.name}
                  width={32}
                  height={32}
                  unoptimized
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                short
              )}
            </span>
            <span className="nav-name-trad">{org.name}</span>
          </div>
          <Link href={`/pilot/${org.slug}`} className="legal-back-pill">
            Zur Übersicht
          </Link>
        </nav>
        {children}
        <PublicFooter org={org} />
      </div>
    </div>
  )
}
