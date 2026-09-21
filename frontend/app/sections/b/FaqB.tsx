import type { FaqEntry } from '../../lib/clubConfig'

interface FaqBProps {
  eyebrow: string
  heading: string
  items: FaqEntry[]
}

/**
 * FAQ, Richtung B (CP-JK-105).
 *
 * Zweispaltig und offen statt als Akkordeon. Die Fragen sind kurz und die
 * Antworten ebenso — ein Aufklappmechanismus versteckt sie nur hinter einem
 * zusätzlichen Klick und macht sie für Suchmaschinen und Screenreader
 * umständlicher, ohne Platz zu sparen, der hier knapp wäre.
 */
export default function FaqB({ eyebrow, heading, items }: FaqBProps) {
  if (items.length === 0) return null

  return (
    <section id="faq" className="bg-[var(--surface-base)] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-ink)] mb-3">
          {eyebrow}
        </p>
        <h2 className="font-display font-bold uppercase text-[var(--text-on-light)] text-3xl sm:text-4xl leading-none mb-10">
          {heading}
        </h2>

        <dl className="grid md:grid-cols-2 gap-x-12 gap-y-7">
          {items.map(item => (
            <div key={item.q} className="min-w-0 border-t border-[var(--line-light)] pt-5">
              <dt className="text-lg font-semibold text-[var(--text-on-light)] mb-2">{item.q}</dt>
              <dd className="text-[15px] leading-relaxed text-[var(--text-on-light-muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
