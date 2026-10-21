'use client'

import { useEffect, useState } from 'react'
import Link from '../preview/AdminLink'
import BandMetric, { type BandMetricProps } from './BandMetric'
import BandTabs, { type TabItem } from './BandTabs'
import LogoutButton from './LogoutButton'
import OrgSwitcher from './OrgSwitcher'

/** `hero` (optional): erzwingt die große Schrift auf dieser Metrik statt
 * auf der ersten. Rückwärtskompatibel: wenn kein hero-Flag gesetzt ist,
 * bekommt Metrik 0 wie bisher die hero-Größe. */
export type MatchdayBandMetric = Omit<BandMetricProps, 'size'> & { hero?: boolean }

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
  backToCamps?: boolean
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
  backToCamps = false,
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
      className="sticky top-0 z-10 px-4 pt-5 pb-5 md:px-6"
      style={{ background: 'var(--cp-band)', borderTop: `3px solid ${brandColor}`, color: 'var(--cp-on-band)' }}
    >
      <div className="mx-auto flex max-w-[1080px] flex-col">
        <div className="flex items-center justify-between gap-4 pb-4">
          <OrgSwitcher name={orgName} logoUrl={orgLogoUrl} orgSlug={orgSlug} />
          <LogoutButton orgSlug={orgSlug} />
        </div>

        {backToCamps && (
          <Link href={`/pilot/${orgSlug}/dashboard`} className="cp-label mb-2 inline-flex min-h-[44px] items-center self-start underline">
            ← Alle Camps
          </Link>
        )}

        {/* Hero-Block — kollabiert per grid-rows (M1), nicht font-size. */}
        {variant === 'full' && <div className={`cp-collapse motion-reduce:transition-none ${showHero ? 'cp-collapse-expanded' : ''}`}>
          <div>
            <div className="pb-5">
              {eyebrow && (
                <p className="cp-label mb-1" style={{ color: 'var(--cp-on-band-2)' }}>
                  {eyebrow}
                </p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="cp-band-hero break-words">{title}</h1>
                  {subtitle && (
                    <p className="cp-body mt-1.5" style={{ color: 'var(--cp-on-band-2)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
                {metrics.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 xl:flex xl:flex-nowrap xl:items-end xl:gap-8">
                    {metrics.map((m, i) => {
                      const anyHero = metrics.some(x => x.hero)
                      const isHero = anyHero ? !!m.hero : (i === 0 && metrics.length > 1)
                      return (
                        <div key={m.label} className={isHero || m.bar || metrics.length === 1 ? undefined : 'hidden md:block'}>
                          <BandMetric {...m} size={isHero ? 'hero' : 'band'} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>}

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
            {variant === 'compact' ? <h1 className="cp-band-title break-words">{title}</h1> : <h2 className="cp-band-title">{title}</h2>}
            {subtitle && (
              <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-on-band-2)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {metrics.length > 0 && (
            <div className="flex flex-wrap gap-5">
              {metrics.map(m => (
                <div key={m.label} className={m.bar || metrics.length === 1 ? undefined : 'hidden md:block'}>
                  <BandMetric {...m} size="inline" />
                </div>
              ))}
            </div>
          )}
        </div>

        <BandTabs tabs={tabs} brandColor={brandColor} />
      </div>
    </header>
  )
}
