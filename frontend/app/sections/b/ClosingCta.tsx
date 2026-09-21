interface ClosingCtaProps {
  heading: string
  text: string
  ctaLabel: string
  ctaHref: string
}

/**
 * Abschluss-CTA, Richtung B (CP-JK-105).
 *
 * Letzte Gelegenheit zur Anfrage für alle, die bis hierhin gelesen haben.
 * Der Text nimmt bewusst die Hürde: Eine Anfrage verpflichtet zu nichts.
 */
export default function ClosingCta({ heading, text, ctaLabel, ctaHref }: ClosingCtaProps) {
  return (
    <section className="bg-[var(--surface-panel)] border-t-2 border-[var(--accent)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-16 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="min-w-0">
          <h2 lang="de" className="font-display font-bold uppercase text-[var(--text-on-dark)] text-3xl sm:text-4xl leading-none mb-3 hyphens-manual break-words">
            {heading}
          </h2>
          <p className="text-[17px] text-[var(--text-on-dark-muted)]">{text}</p>
        </div>
        <a
          href={ctaHref}
          className="shrink-0 self-start lg:self-auto bg-[var(--accent)] text-[var(--on-accent)] text-lg font-semibold px-10 py-5 rounded-[var(--radius-pill)] whitespace-nowrap hover:brightness-110 active:brightness-95 transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-on-dark)] focus-visible:ring-offset-[3px] focus-visible:ring-offset-[var(--surface-panel)]"
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  )
}
