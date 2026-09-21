export interface CoreOffer {
  number: string
  title: string
  text: string
}

interface CoreOffersProps {
  eyebrow: string
  heading: string
  intro?: string
  offers: CoreOffer[]
}

/**
 * Kernangebote, Richtung B (CP-JK-105).
 *
 * Bewusst KEINE Karten. Die alte Seite reihte überall dieselben weissen
 * Kacheln aneinander, wodurch Kernangebot und Nebenangebot gleich aussahen.
 * Hier tragen Ziffer, Linie und Typografie die Gliederung — die Sektion
 * unterscheidet sich dadurch von den Nebenangeboten weiter unten, ohne dafür
 * Farbe zu verbrauchen.
 */
export default function CoreOffers({ eyebrow, heading, intro, offers }: CoreOffersProps) {
  if (offers.length === 0) return null

  return (
    <section id="training" className="bg-[var(--surface-inverse)] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] mb-3">
              {eyebrow}
            </p>
            <h2 className="font-display font-bold uppercase text-[var(--text-on-dark)] text-4xl sm:text-5xl leading-none">
              {heading}
            </h2>
          </div>
          {intro && (
            <p className="text-[var(--text-on-dark-muted)] text-base leading-relaxed max-w-sm">
              {intro}
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 border-t border-[var(--line-dark)]">
          {offers.map((o, i) => (
            <div
              key={o.number}
              // min-w-0: Grid-Kinder schrumpfen sonst nicht und lange deutsche
              // Komposita ("Kleingruppentraining") laufen in die Nachbarspalte.
              className={`min-w-0 py-9 md:px-10 ${i === 0 ? 'md:pl-0' : ''} ${
                i === offers.length - 1 ? 'md:pr-0' : ''
              } ${
                i < offers.length - 1
                  ? 'border-b border-[var(--line-dark)] md:border-b-0 md:border-r'
                  : ''
              }`}
            >
              <p aria-hidden="true" className="font-display text-5xl font-bold leading-none text-[var(--accent)]">
                {o.number}
              </p>
              <h3
                lang="de"
                // hyphens-manual: getrennt wird nur an den weichen Trennstellen
                // (­), die der Text in siteContent mitbringt — an der
                // Wortfuge, nicht irgendwo. break-words bleibt als letztes Netz.
                className="font-display text-2xl sm:text-3xl font-semibold uppercase tracking-[0.02em] text-[var(--text-on-dark)] mt-4 mb-3.5 hyphens-manual break-words"
              >
                {o.title}
              </h3>
              <p className="text-[var(--text-on-dark-muted)] text-base leading-relaxed">
                {o.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
