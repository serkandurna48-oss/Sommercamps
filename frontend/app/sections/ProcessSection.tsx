export interface ProcessStep {
  step: string
  title: string
  text: string
}

interface ProcessSectionProps {
  eyebrow: string
  heading: string
  steps: ProcessStep[]
}

/**
 * Ausführlicher Ablauf auf dunkler Fläche (bisheriger KSV-Zweig).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 */
export default function ProcessSection({ eyebrow, heading, steps }: ProcessSectionProps) {
  return (
    <section className="py-20 px-6 bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold">{heading}</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-10">
          {steps.map(s => (
            <div key={s.step} className="flex flex-col">
              <p className="text-6xl font-black text-white/10 leading-none mb-4 tabular-nums">{s.step}</p>
              <p className="text-base font-bold text-white mb-2">{s.title}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
