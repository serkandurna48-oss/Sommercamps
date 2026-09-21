import Image from 'next/image'

interface HeroBProps {
  eyebrow: string
  headline: string
  subline: string
  primaryCta: { label: string; href: string }
  secondaryCta: { label: string; href: string }
  footnote?: string
  imageSrc?: string
  imageAlt: string
}

/**
 * Hero, Richtung B (CP-JK-105).
 *
 * Die alte Fassung stellte den Text über einen leeren dunklen Block und schob
 * das Mannschaftsfoto an den unteren Rand, wo es fast vollständig weggeschnitten
 * wurde. Hier trägt das Foto die ganze Fläche; der Verlauf liegt als eigene
 * Ebene darüber, damit der Text unabhängig vom Bildinhalt lesbar bleibt.
 *
 * Keine Kennzahlenzeile mehr: "5 Programme · 2 Camps · Flexibel" zählte das
 * eigene Inventar, nicht Kompetenz. Vertrauen trägt jetzt die Partnervereins-
 * leiste direkt darunter.
 */
export default function HeroB({
  eyebrow,
  headline,
  subline,
  primaryCta,
  secondaryCta,
  footnote,
  imageSrc,
  imageAlt,
}: HeroBProps) {
  return (
    <section id="top" className="relative overflow-hidden bg-[var(--surface-inverse)]">
      {imageSrc && (
        <div className="absolute inset-0 z-0">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            priority
            unoptimized
            sizes="100vw"
            className="object-cover object-[60%_35%]"
          />
          {/* Zwei Ebenen: der Farbverlauf trägt die Lesbarkeit links, der
              zweite dunkelt den unteren Rand für den Übergang zur Leiste ab. */}
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface-inverse)] via-[var(--surface-inverse)]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-inverse)] via-transparent to-transparent" />
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 lg:py-32">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2.5 mb-6">
            <span aria-hidden="true" className="w-7 h-0.5 bg-[var(--accent)] block" />
            <span className="text-xs sm:text-[13px] font-semibold tracking-[0.22em] uppercase text-[var(--accent-quiet)]">
              {eyebrow}
            </span>
          </p>

          <h1 className="font-display font-bold uppercase text-[var(--text-on-dark)] text-[2.75rem] leading-[0.96] sm:text-6xl lg:text-[5.1rem] lg:leading-[0.94] tracking-[-0.01em] mb-6">
            {headline}
          </h1>

          <p className="text-[var(--text-on-dark-muted)] text-lg sm:text-xl leading-relaxed max-w-xl mb-9">
            {subline}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={primaryCta.href}
              className="bg-[var(--accent)] text-[var(--on-accent)] text-[17px] font-semibold px-9 py-4 rounded-[var(--radius-pill)] text-center hover:brightness-110 active:brightness-95 transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-on-dark)] focus-visible:ring-offset-[3px] focus-visible:ring-offset-[var(--surface-inverse)]"
            >
              {primaryCta.label}
            </a>
            <a
              href={secondaryCta.href}
              className="border border-[#55607A] text-[var(--text-on-dark)] text-[17px] font-semibold px-8 py-4 rounded-[var(--radius-pill)] text-center hover:bg-white/10 hover:border-[#7B8499] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-on-dark)] focus-visible:ring-offset-[3px] focus-visible:ring-offset-[var(--surface-inverse)]"
            >
              {secondaryCta.label}
            </a>
          </div>

          {footnote && (
            <p className="mt-6 text-sm text-[var(--text-quiet)]">{footnote}</p>
          )}
        </div>
      </div>
    </section>
  )
}
