import Image from 'next/image'
import Reveal from '../components/Reveal'
import type { HighlightEntry } from '../lib/clubConfig'

interface WhyUsSectionProps {
  eyebrow: string
  heading: string
  /** Begleitfoto. Kommt aus der Mandantenkonfiguration, nicht mehr hartkodiert. */
  imageSrc?: string
  highlights: HighlightEntry[]
}

/**
 * "Warum wir" — Foto links, Argumentkarten rechts.
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert. Eyebrow, Überschrift
 * und Bildpfad waren vorher fest auf JK gemünzt ("Warum JK?", "/jk/team.jpg")
 * und sind jetzt Props.
 */
export default function WhyUsSection({ eyebrow, heading, imageSrc, highlights }: WhyUsSectionProps) {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-gray-900">{heading}</h2>
        </div>
        <Reveal className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:items-stretch">
          {imageSrc && (
            <div className="relative rounded-2xl overflow-hidden h-72 sm:h-96 lg:h-auto mb-8 lg:mb-0">
              <Image src={imageSrc} alt="" fill unoptimized className="object-cover" />
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
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
        </Reveal>
      </div>
    </section>
  )
}
