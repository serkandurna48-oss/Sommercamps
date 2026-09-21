import Image from 'next/image'
import Reveal from '../components/Reveal'
import type { ProgramEntry } from '../lib/clubConfig'

interface FeaturedCampsSectionProps {
  programs: ProgramEntry[]
  /** Hintergrundmotiv der Sektion. Kommt aus der Mandantenkonfiguration, nicht mehr hartkodiert. */
  backgroundImageSrc?: string
  venueInfoText?: string | null
  firstTeamInfoText?: string | null
  ctaHref: string
}

/**
 * Terminierte, hervorgehobene Angebote (aktuelle Camps).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert. Der vormals
 * hartkodierte Pfad "/jk/camp.jpg" ist jetzt eine Prop — damit enthält die
 * geteilte Seite keinen mandantenspezifischen Asset-Pfad mehr.
 */
export default function FeaturedCampsSection({
  programs,
  backgroundImageSrc,
  venueInfoText,
  firstTeamInfoText,
  ctaHref,
}: FeaturedCampsSectionProps) {
  return (
    <section id="termine" className="relative overflow-hidden py-20 px-6 bg-gray-950 text-white scroll-mt-20">
      {backgroundImageSrc && (
        <div className="absolute inset-0 z-0">
          <Image src={backgroundImageSrc} alt="" fill unoptimized className="object-cover object-top" />
          <div className="absolute inset-0 bg-gray-950/70" />
        </div>
      )}
      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Jetzt aktuell</p>
          <h2 className="text-3xl font-bold">Aktuelle Sommercamps</h2>
        </div>

        {venueInfoText && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-gray-300 leading-relaxed">
            <p className="font-semibold text-white mb-1">Veranstaltungsort</p>
            <p>{venueInfoText}</p>
          </div>
        )}
        {firstTeamInfoText && (
          <div className="mb-8 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-gray-300 leading-relaxed">
            <p className="font-semibold text-white mb-1">Hinweis zu Trainingseinheiten mit der 1. Mannschaft</p>
            <p>{firstTeamInfoText}</p>
          </div>
        )}

        {programs.length > 0 && (
          <Reveal className="grid sm:grid-cols-2 gap-5">
            {programs.map(p => (
              <div
                key={p.title}
                className="bg-white text-gray-900 rounded-2xl border-2 border-[var(--brand-accent)] shadow-md p-7 flex flex-col gap-3 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md w-fit">
                    {p.tag ?? p.category}
                  </span>
                  <span className="text-[var(--brand-accent)] text-xs font-semibold uppercase tracking-wider text-right">Begrenzte Plätze</span>
                </div>
                <p className="font-bold text-gray-900 text-lg">{p.title}</p>
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-[var(--brand-accent)] font-semibold text-sm">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    {p.cadence}
                  </p>
                  {p.title.includes(' bei ') && (
                    <p className="flex items-center gap-1.5 text-gray-500 text-xs">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      {p.title.split(' bei ')[1]}
                    </p>
                  )}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
                {p.benefits && (
                  <ul className="space-y-1.5 mt-1">
                    {p.benefits.map(b => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700">
                        <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {p.priceNote && (
                  <p className="text-gray-800 text-sm font-semibold border-t border-gray-100 pt-3 mt-1">{p.priceNote}</p>
                )}
                <a
                  href={ctaHref}
                  className="mt-auto bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-black active:bg-gray-800 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                >
                  Jetzt teilnehmen →
                </a>
              </div>
            ))}
          </Reveal>
        )}
      </div>
    </section>
  )
}
