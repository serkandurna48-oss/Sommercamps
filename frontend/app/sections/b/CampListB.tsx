import type { ProgramEntry } from '../../lib/clubConfig'

interface CampListBProps {
  eyebrow: string
  heading: string
  meta?: string
  programs: ProgramEntry[]
  ctaLabel: string
  ctaHref: string
  availabilityLabel: string
  venueInfoText?: string | null
}

/** Häkchen als Icon, nie als Emoji — gruen-rotes Unicode-Haken bricht das Gold/Navy-System. */
function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-ink)"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 mt-[3px]"
    >
      <path d="M4 12.5l5.2 5.2L20 7" />
    </svg>
  )
}

/**
 * Aktuelle Camps, Richtung B (CP-JK-105).
 *
 * Harter Flächenwechsel von Dunkel auf Hell. Das ist Absicht: Der Bruch gibt
 * dem Konversionskern Aufmerksamkeit, ohne sie über Farbe zu erkaufen.
 *
 * Der unscharfe Foto-Hintergrund der alten Fassung entfällt — Text auf
 * unruhiger Fläche kostete Kontrast, und das Gold wirkte darauf matt.
 */
export default function CampListB({
  eyebrow,
  heading,
  meta,
  programs,
  ctaLabel,
  ctaHref,
  availabilityLabel,
  venueInfoText,
}: CampListBProps) {
  if (programs.length === 0) return null

  return (
    <section id="camps" className="bg-[var(--surface-base)] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-11">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-ink)] mb-3">
              {eyebrow}
            </p>
            <h2 className="font-display font-bold uppercase text-[var(--text-on-light)] text-4xl sm:text-5xl leading-none">
              {heading}
            </h2>
          </div>
          {meta && <p className="text-[15px] text-[var(--text-on-light-muted)]">{meta}</p>}
        </div>

        {venueInfoText && (
          <p className="mb-8 border border-[var(--line-light)] bg-white/60 rounded-[var(--radius-card)] px-5 py-4 text-sm leading-relaxed text-[var(--text-on-light-muted)]">
            {venueInfoText}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-7">
          {programs.map(p => {
            const location = p.title.includes(' bei ') ? p.title.split(' bei ')[1] : null
            return (
              <article
                key={p.title}
                className="bg-[var(--surface-card)] border border-[var(--line-light)] rounded-[var(--radius-card)] overflow-hidden flex flex-col hover:border-[#B9AF9B] transition-colors"
              >
                <div aria-hidden="true" className="h-2 bg-[var(--accent)]" />
                <div className="p-7 sm:p-9 flex flex-col gap-4 grow">
                  <div className="flex items-center justify-between gap-3">
                    <span className="bg-[#F0EBE0] text-[var(--text-on-light-muted)] text-xs font-semibold tracking-[0.1em] uppercase px-2.5 py-1.5 rounded">
                      {p.tag ?? p.category}
                    </span>
                    <span className="text-xs font-semibold tracking-[0.1em] uppercase text-[var(--accent-ink)]">
                      {availabilityLabel}
                    </span>
                  </div>

                  <h3 className="font-display text-3xl font-bold uppercase leading-[1.05] text-[var(--text-on-light)]">
                    {p.title}
                  </h3>

                  <div className="border-y border-[#EAE4D8] py-4 flex flex-col gap-2">
                    <p className="flex items-center gap-2.5 text-base font-semibold text-[var(--text-on-light)]">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} aria-hidden="true" className="shrink-0">
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M3 10h18M8 3v4M16 3v4" />
                      </svg>
                      {p.cadence}
                    </p>
                    {location && (
                      <p className="flex items-center gap-2.5 text-[15px] text-[var(--text-on-light-muted)]">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} aria-hidden="true" className="shrink-0">
                          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                          <circle cx="12" cy="10" r="2.6" />
                        </svg>
                        {location}
                      </p>
                    )}
                  </div>

                  {p.benefits && p.benefits.length > 0 && (
                    <ul className="flex flex-col gap-2.5">
                      {p.benefits.map(b => (
                        <li key={b} className="flex items-start gap-3 text-[15px] text-[#2A313D]">
                          <CheckIcon />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="grow" />

                  <div className="border-t border-[#EAE4D8] pt-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    {p.priceNote && (
                      <p className="text-[15px] font-semibold text-[var(--text-on-light)] leading-snug">
                        {p.priceNote}
                      </p>
                    )}
                    <a
                      href={ctaHref}
                      className="bg-[var(--accent)] text-[var(--on-accent)] text-base font-semibold px-6 py-3.5 rounded-[var(--radius-pill)] text-center whitespace-nowrap hover:brightness-110 active:brightness-95 transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] focus-visible:ring-offset-2"
                    >
                      {ctaLabel}
                    </a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
