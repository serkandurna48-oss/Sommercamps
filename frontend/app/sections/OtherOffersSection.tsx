import type { ProgramEntry } from '../lib/clubConfig'

interface OtherOffersSectionProps {
  programs: ProgramEntry[]
  ctaHref: string
}

/**
 * Nachrangige Angebote ("Weitere Angebote").
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 */
export default function OtherOffersSection({ programs, ctaHref }: OtherOffersSectionProps) {
  if (programs.length === 0) return null

  return (
    <section className="py-16 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Auf Anfrage</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Weitere Angebote</h2>
        </div>
        <div className={`grid sm:grid-cols-2 gap-5 ${programs.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
          {programs.map(p => (
            <div
              key={p.title}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 flex flex-col gap-3 hover:shadow-lg hover:-translate-y-1 hover:border-gray-300 transition-all duration-300"
            >
              <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md w-fit">
                {p.tag ?? p.category}
              </span>
              <p className="font-bold text-gray-900 text-lg">{p.title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
              <p className="text-[var(--brand-accent)] font-semibold text-sm">{p.cadence}</p>
              <a
                href={ctaHref}
                className="mt-auto bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-black active:bg-gray-800 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
              >
                Angebot anfragen →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
