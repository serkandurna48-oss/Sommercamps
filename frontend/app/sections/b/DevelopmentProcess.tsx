import ContentPlaceholder from './ContentPlaceholder'

export interface ProcessStepSpec {
  step: string
  title: string
  text: string
}

interface DevelopmentProcessProps {
  eyebrow: string
  heading: string
  intro: string
  steps: ProcessStepSpec[]
  pendingNote?: string
}

/**
 * Entwicklungsprozess, Richtung B (CP-JK-105).
 *
 * Steht bewusst an der Stelle, an der sonst Testimonials stehen würden. Es
 * gibt noch keine echten Eltern- oder Spielerstimmen, und erfundene kommen
 * nicht in Frage. Statt die Stelle leer zu lassen, zeigt die Seite, WIE
 * gearbeitet wird — das ist überprüfbar und verspricht nichts.
 *
 * Sobald echte Stimmen mit Einverständnis vorliegen, ersetzt eine
 * Stimmen-Sektion diesen Block oder ergänzt ihn.
 */
export default function DevelopmentProcess({
  eyebrow,
  heading,
  intro,
  steps,
  pendingNote,
}: DevelopmentProcessProps) {
  if (steps.length === 0) return null

  return (
    <section className="bg-[var(--surface-inverse)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <div className="max-w-3xl mb-11">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] mb-3">
            {eyebrow}
          </p>
          <h2 className="font-display font-bold uppercase text-[var(--text-on-dark)] text-4xl sm:text-5xl leading-none mb-4">
            {heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-[var(--text-on-dark-muted)]">{intro}</p>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(s => (
            <li
              key={s.step}
              className="min-w-0 bg-[var(--surface-panel)] border-t-2 border-[var(--accent)] px-6 py-7"
            >
              <p className="font-display text-[15px] font-bold tracking-[0.15em] text-[var(--accent-quiet)] mb-3.5">
                {s.step}
              </p>
              <h3 lang="de" className="text-lg font-semibold text-[var(--text-on-dark)] mb-2.5 hyphens-manual break-words">
                {s.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-[var(--text-on-dark-muted)]">{s.text}</p>
            </li>
          ))}
        </ol>

        {pendingNote && (
          <div className="mt-7 max-w-3xl">
            <ContentPlaceholder>{pendingNote}</ContentPlaceholder>
          </div>
        )}
      </div>
    </section>
  )
}
