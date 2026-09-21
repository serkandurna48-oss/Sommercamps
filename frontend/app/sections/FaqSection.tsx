import type { FaqEntry } from '../lib/clubConfig'

interface FaqSectionProps {
  eyebrow: string
  heading: string
  items: FaqEntry[]
}

/**
 * FAQ-Akkordeon. Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 */
export default function FaqSection({ eyebrow, heading, items }: FaqSectionProps) {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-gray-900">{heading}</h2>
        </div>
        <div className="space-y-3">
          {items.map(faq => (
            <details key={faq.q} className="group rounded-xl border border-gray-200 bg-white px-5 py-4 open:border-gray-300 open:shadow-sm transition-shadow duration-300">
              <summary className="flex items-center justify-between gap-3 font-semibold text-gray-900 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded-lg -mx-2 px-2 py-0.5 hover:text-[var(--brand-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2">
                {faq.q}
                <svg
                  className="w-4 h-4 shrink-0 text-gray-400 transition-transform [&[open]]:rotate-180 group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </summary>
              <p className="text-sm text-gray-500 leading-relaxed mt-2.5">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
