'use client'

import { useEffect, useState } from 'react'
import BandMetric, { type BandMetricProps } from './BandMetric'
import BandTabs, { type TabItem } from './BandTabs'
import LogoutButton from './LogoutButton'
import OrgSwitcher from './OrgSwitcher'

export type MatchdayBandMetric = Omit<BandMetricProps, 'size'>

export interface MatchdayBandProps {
  /** full = Dashboard (grosses Band, schrumpft beim Scrollen per M1).
   *  compact = Unterseiten (Command Center), immer schmal. */
  variant: 'full' | 'compact'
  orgSlug: string
  orgName: string
  orgLogoUrl: string | null
  /** "Nächstes Camp" — nur variant="full". */
  eyebrow?: string
  title: string
  subtitle?: string
  metrics?: MatchdayBandMetric[]
  tabs: TabItem[]
  /** --cp-brand — eine der fünf erlaubten Vereinsfarben-Stellen: Kante am
   * oberen Bandrand + aktiver Tab-Unterstrich (siehe Abschnitt 3.3). */
  brandColor: string
}

/**
 * M1 (Auftrag Abschnitt 7): ab 80px Scrollposition kollabiert der grosse
 * Hero-Block (grid-template-rows 1fr -> 0fr, 240ms, cubic-bezier(.2,0,0,1)
 * — laut Verbote-Liste die einzige erlaubte Ausnahme von "nur transform/
 * opacity"), während eine kompakte Titelzeile eingeblendet wird (opacity).
 * Kein Font-Size-Tween — das wäre eine verbotene Eigenschaft.
 */
export default function MatchdayBand({
  variant,
  orgSlug,
  orgName,
  orgLogoUrl,
  eyebrow,
  title,
  subtitle,
  metrics = [],
  tabs,
  brandColor,
}: MatchdayBandProps) {
  const [scrolled, setScrolled] = useState(variant === 'compact')

  useEffect(() => {
    if (variant !== 'full') return
    function onScroll() {
      setScrolled(window.scrollY > 80)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [variant])

  const showHero = variant === 'full' && !scrolled

  return (
    <header
      className="sticky top-0 z-10 px-6 pt-5"
      style={{ background: 'var(--cp-band)', borderTop: `3px solid ${brandColor}`, color: 'var(--cp-on-band)' }}
    >
      <div className="mx-auto flex max-w-[1080px] flex-col">
        <div className="flex items-center justify-between gap-4 pb-4">
          <OrgSwitcher name={orgName} logoUrl={orgLogoUrl} />
          <LogoutButton orgSlug={orgSlug} />
        </div>

        {/* Hero-Block — kollabiert per grid-rows (M1), nicht font-size. */}
        <div className={`cp-hero-collapse motion-reduce:transition-none ${showHero ? 'cp-hero-expanded' : ''}`}>
          <div>
            <div className="pb-5">
              {eyebrow && (
                <p className="cp-label mb-1" style={{ color: 'var(--cp-on-band-2)' }}>
                  {eyebrow}
                </p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h1 className="cp-band-hero">{title}</h1>
                  {subtitle && (
                    <p className="cp-body mt-1.5" style={{ color: 'var(--cp-on-band-2)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
                {metrics.length > 0 && (
                  <div className="flex flex-wrap gap-8">
                    {metrics.map(m => (
                      <BandMetric key={m.label} {...m} size="band" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Kompakte Titelzeile — sichtbar wenn Hero kollabiert ist (M1) oder
            variant="compact" (Command Center hat nie einen Hero). */}
        <div
          className="flex flex-wrap items-center justify-between gap-4 pb-4 transition-opacity duration-[240ms] motion-reduce:transition-none"
          style={{
            display: showHero ? 'none' : 'flex',
            opacity: showHero ? 0 : 1,
          }}
        >
          <div>
            <h2 className="cp-band-title">{title}</h2>
            {subtitle && (
              <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-on-band-2)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {metrics.length > 0 && (
            <div className="flex flex-wrap gap-5">
              {metrics.map(m => (
                <BandMetric key={m.label} {...m} size="inline" />
              ))}
            </div>
          )}
        </div>

        <BandTabs tabs={tabs} brandColor={brandColor} />
      </div>
    </header>
  )
}
