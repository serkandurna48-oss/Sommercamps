import InquiryForm from '../../components/InquiryForm'
import ContentPlaceholder from './ContentPlaceholder'

interface RegistrationSectionBProps {
  eyebrow: string
  heading: string
  intro: string
  topics: string[]
  sidebarHeading: string
  sidebarSteps: string[]
  contactHeading: string
  /** Noch fehlende Kontaktwege. Werden als Lücke markiert, nicht erfunden. */
  contactPending: string[]
}

/**
 * Anfrage-Sektion, Richtung B (CP-JK-105).
 *
 * Formular links, Ablauf rechts — das Muster stammt aus dem KSV-Formular, das
 * sich in Produktion bewährt hat. Auf JKs alter Seite fehlte es komplett: Dort
 * stand eine "kommt bald"-Sackgasse mit mailto-Link.
 *
 * Das Formular selbst ist CP-JK-101 und schreibt nach POST /inquiries.
 */
export default function RegistrationSectionB({
  eyebrow,
  heading,
  intro,
  topics,
  sidebarHeading,
  sidebarSteps,
  contactHeading,
  contactPending,
}: RegistrationSectionBProps) {
  return (
    <section id="anmeldung" className="bg-[var(--surface-inverse)] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] mb-3">
            {eyebrow}
          </p>
          <h2 className="font-display font-bold uppercase text-[var(--text-on-dark)] text-4xl sm:text-5xl leading-none mb-4">
            {heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-[var(--text-on-dark-muted)]">{intro}</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-10 items-start">
          <div className="min-w-0 bg-[var(--surface-panel)] border border-[var(--line-dark)] rounded-[var(--radius-card)] p-6 sm:p-9">
            <InquiryForm topics={topics} tone="dark" />
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-28">
            <div className="bg-[var(--surface-panel)] border border-[var(--line-dark)] rounded-[var(--radius-card)] p-6">
              <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--accent-quiet)] mb-5">
                {sidebarHeading}
              </p>
              <ol className="flex flex-col gap-4">
                {sidebarSteps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3.5">
                    <span
                      aria-hidden="true"
                      className="w-6.5 h-6.5 min-w-[26px] h-[26px] rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-sm font-bold flex items-center justify-center shrink-0"
                    >
                      {i + 1}
                    </span>
                    <span className="text-[15px] text-[var(--text-on-dark)] leading-snug pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            {contactPending.length > 0 && (
              <div className="bg-[var(--surface-panel)] border border-[var(--line-dark)] rounded-[var(--radius-card)] p-6">
                <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--accent-quiet)] mb-4">
                  {contactHeading}
                </p>
                <div className="flex flex-col gap-3">
                  {contactPending.map(c => (
                    <ContentPlaceholder key={c}>{c}</ContentPlaceholder>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
