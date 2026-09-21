import type { HighlightEntry } from '../lib/clubConfig'

interface HighlightsSectionProps {
  eyebrow: string
  heading: string
  highlights: HighlightEntry[]
}

/**
 * Highlight-Raster ohne Begleitfoto (bisheriger KSV-Zweig).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 */
export default function HighlightsSection({ eyebrow, heading, highlights }: HighlightsSectionProps) {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-gray-900">{heading}</h2>
        </div>
        <div className={`grid sm:grid-cols-2 gap-5 ${highlights.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
          {highlights.map(h => (
            <div
              key={h.title}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 hover:border-gray-300 transition-all duration-300"
            >
              <div className="w-11 h-11 bg-[var(--brand-accent)]/10 rounded-xl flex items-center justify-center mb-4 text-[var(--brand-accent)]">
                {h.icon}
              </div>
              <p className="font-semibold text-gray-900 mb-1.5">{h.title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{h.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
