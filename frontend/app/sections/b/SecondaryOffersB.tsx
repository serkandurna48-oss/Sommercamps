import type { ProgramEntry } from '../../lib/clubConfig'

interface SecondaryOffersBProps {
  eyebrow: string
  heading: string
  intro: string
  programs: ProgramEntry[]
  ctaLabel: string
  ctaHref: string
}

/**
 * Weitere Formate, Richtung B (CP-JK-105).
 *
 * Bewusst leiser als die Kernangebote: hellere Fläche, kleinere Überschrift,
 * Textlink statt Button. "5 Freunde", "Messday" und "Spieleranalyse" sollen
 * auffindbar sein, aber nicht mit den drei Kernformaten konkurrieren.
 *
 * Jede Karte erklärt zuerst das Kundenproblem — die alten Beschreibungen
 * starteten mit dem Produktnamen, den niemand von aussen kennt.
 */
export default function SecondaryOffersB({
  eyebrow,
  heading,
  intro,
  programs,
  ctaLabel,
  ctaHref,
}: SecondaryOffersBProps) {
  if (programs.length === 0) return null

  return (
    <section className="bg-[var(--surface-base)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-ink)] mb-3">
          {eyebrow}
        </p>
        <h2 className="font-display font-bold uppercase text-[var(--text-on-light)] text-3xl sm:text-4xl leading-none mb-3">
          {heading}
        </h2>
        <p className="text-base leading-relaxed text-[var(--text-on-light-muted)] max-w-2xl mb-10">
          {intro}
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map(p => (
            <article
              key={p.title}
              className="min-w-0 bg-[var(--surface-card)] border border-[var(--line-light)] rounded-[var(--radius-card)] p-7 flex flex-col"
            >
              <span className="self-start bg-[#F0EBE0] text-[var(--text-on-light-muted)] text-xs font-semibold tracking-[0.08em] uppercase px-2.5 py-1.5 rounded">
                {p.tag ?? p.category}
              </span>
              <h3 lang="de" className="text-[22px] font-semibold text-[var(--text-on-light)] mt-4 mb-2.5 hyphens-manual break-words">
                {p.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-[var(--text-on-light-muted)] mb-5">
                {p.description}
              </p>
              <div className="grow" />
              <a
                href={ctaHref}
                className="self-start inline-flex items-center min-h-[44px] text-[15px] font-semibold text-[var(--accent-ink)] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] focus-visible:ring-offset-2"
              >
                <span className="border-b border-[var(--accent-ink)] pb-0.5">{ctaLabel}</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
