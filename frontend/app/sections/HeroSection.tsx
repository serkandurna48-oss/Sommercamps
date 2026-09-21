import type { ReactNode } from 'react'
import Image from 'next/image'

export interface HeroCta {
  href: string
  label: string
}

export interface HeroFact {
  value: string
  label: string
}

interface HeroSectionProps {
  /** Ohne Bild bleibt der Hero ein reiner Farbblock (bisheriges KSV-Verhalten). */
  imageSrc?: string
  badgeText: string
  headline: ReactNode
  subline: string
  primaryCta: HeroCta
  secondaryCta: HeroCta
  /** Optionale dritte CTA. Wird für Richtung B bewusst nicht mehr gesetzt. */
  tertiaryCta?: HeroCta
  footnote?: string
  facts: HeroFact[]
  /**
   * `compact` bildet die bisherige Sonderbehandlung für Clubs mit PROGRAMS ab
   * (engere Paddings, schmalere Textspalte, 4 statt 5 Faktenspalten).
   */
  compact?: boolean
}

/**
 * Hero. Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 * Alle vormals aus PROGRAMS.length abgeleiteten Texte kommen jetzt als Props.
 */
export default function HeroSection({
  imageSrc,
  badgeText,
  headline,
  subline,
  primaryCta,
  secondaryCta,
  tertiaryCta,
  footnote,
  facts,
  compact = false,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gray-950 text-white">
      {imageSrc && (
        <div className="absolute inset-0 z-0">
          <Image src={imageSrc} alt="" fill priority unoptimized className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 via-gray-950/35 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950/60 via-transparent to-transparent" />
        </div>
      )}
      <div className={`relative z-10 max-w-5xl mx-auto px-6 ${compact ? 'py-20 sm:py-28' : 'py-24 sm:py-32'}`}>
        <div className={compact ? 'max-w-xl' : 'max-w-2xl'}>
          <span className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-accent)] inline-block" />
            {badgeText}
          </span>
          <h1 className={`text-4xl ${compact ? 'sm:text-5xl lg:text-6xl' : 'sm:text-6xl'} font-extrabold leading-[1.1] tracking-tight mb-6`}>
            {headline}
          </h1>
          <p className="text-gray-300 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl">{subline}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={primaryCta.href}
              className="bg-white text-gray-900 font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              {primaryCta.label}
            </a>
            <a
              href={secondaryCta.href}
              className="border border-white/40 bg-white/5 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/15 hover:border-white/60 active:bg-white/20 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              {secondaryCta.label}
            </a>
            {tertiaryCta && (
              <a
                href={tertiaryCta.href}
                className="border border-white/40 bg-white/5 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/15 hover:border-white/60 active:bg-white/20 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                {tertiaryCta.label}
              </a>
            )}
          </div>

          {footnote && <p className="mt-4 text-xs sm:text-sm text-gray-400">{footnote}</p>}

          {facts.length > 0 && (
            <div className={`mt-12 pt-8 border-t border-white/10 grid grid-cols-2 ${compact ? 'sm:grid-cols-4' : 'sm:grid-cols-5'} gap-6`}>
              {facts.map(f => (
                <div key={f.label}>
                  <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{f.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
