export interface CompactProcessStep {
  step: string
  title: string
  text: string
}

interface CompactProcessSectionProps {
  eyebrow: string
  steps: CompactProcessStep[]
}

/**
 * Kompakter Ablauf in einer Zeile (bisheriger PROGRAMS-Zweig).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 */
export default function CompactProcessSection({ eyebrow, steps }: CompactProcessSectionProps) {
  return (
    <section className="py-12 px-6 bg-white border-t border-gray-100">
      <div className="max-w-5xl mx-auto">
        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">{eyebrow}</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map(s => (
            <div key={s.step} className="flex items-center gap-4">
              <span className="w-9 h-9 rounded-full bg-[var(--brand-accent)] text-gray-950 font-bold flex items-center justify-center shrink-0 text-sm">
                {s.step}
              </span>
              <div>
                <p className="text-sm font-bold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500 leading-snug">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
