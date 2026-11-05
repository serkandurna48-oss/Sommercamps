'use client'

import Link from '../preview/AdminLink'
import BandMetric, { type BandMetricProps } from './BandMetric'
import BandTabs, { type TabItem } from './BandTabs'
import LogoutButton from './LogoutButton'
import OrgSwitcher from './OrgSwitcher'

export type MatchdayBandMetric = Omit<BandMetricProps, 'size'>

export interface MatchdayBandProps {
  orgSlug: string
  orgName: string
  orgLogoUrl: string | null
  title: string
  subtitle?: string
  metrics?: MatchdayBandMetric[]
  tabs: TabItem[]
  brandColor: string
  /** Omit on the dashboard; all other screens supply their parent route. */
  backHref?: string
}

/** One compact header, without mobile stickiness or scroll-driven resizing. */
export default function MatchdayBand({ orgSlug, orgName, orgLogoUrl, title, subtitle, metrics = [], tabs, brandColor, backHref }: MatchdayBandProps) {
  return (
    <header
      className="cp-band z-10 px-4 pt-3 pb-1 md:sticky md:top-0 md:px-6 md:pt-4 md:pb-0"
    >
      <div className="mx-auto flex max-w-[1080px] flex-col">
        <div className="flex min-h-[44px] items-center justify-between gap-4 pb-2 md:pb-3">
          <OrgSwitcher name={orgName} logoUrl={orgLogoUrl} orgSlug={orgSlug} clubColor={brandColor} />
          <div className="flex items-center gap-3">
            <Link href={`/pilot/${orgSlug}/hilfe`} className="cp-focus cp-label inline-flex min-h-[44px] items-center underline underline-offset-4" style={{ color: 'var(--cp-on-band-2)' }}>Hilfe</Link>
            <LogoutButton orgSlug={orgSlug} />
          </div>
        </div>
        {backHref && (
          <Link href={backHref} className="cp-focus cp-label mb-1 inline-flex min-h-[44px] items-center self-start underline underline-offset-4" style={{ color: 'var(--cp-on-band-2)' }}>
            ← Zurück
          </Link>
        )}
        <div className="flex min-h-[72px] items-end justify-between gap-4 pb-4 md:pb-5">
          <div className="min-w-0 flex-1">
            <h1 className="cp-band-title break-words">{title}</h1>
            {subtitle && <p className="cp-label mt-1" style={{ color: 'var(--cp-on-band-2)', fontWeight: 500 }}>{subtitle}</p>}
          </div>
          {metrics.length > 0 && (
            <div className="flex max-w-[45%] gap-6 md:max-w-none">
              {metrics.slice(0, 3).map((m, index) => <div key={m.label} className={index > 0 ? 'hidden md:block' : undefined}><BandMetric {...m} size="inline" /></div>)}
            </div>
          )}
        </div>
        <BandTabs tabs={tabs} />
      </div>
    </header>
  )
}
