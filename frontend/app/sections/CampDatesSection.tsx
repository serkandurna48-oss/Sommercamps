import type { CampEntry } from '../lib/clubConfig'

interface CampDatesSectionProps {
  eyebrow: string
  heading: string
  camps: CampEntry[]
  campPrice: string
  venueInfoText?: string | null
  firstTeamInfoText?: string | null
  /**
   * Kleingedruckte Metazeile je Karte, z. B. ["4 Tage", "10:00–15:00 Uhr", "Kinder 5–12 Jahre"].
   * Wird von page.tsx aus GET /config zusammengesetzt. Teile, für die es keinen
   * belegten Wert gibt (etwa die Altersspanne bei nicht erreichbarem Backend),
   * werden dort weggelassen statt geraten — hier steht bewusst keine Zahl im Code.
   */
  metaParts: string[]
}

/**
 * Termin-Karten (bisheriger KSV-Zweig).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert. Die vormals fest
 * einkompilierte Zeile "4 Tage · 10:00–15:00 Uhr · Kinder 5–12 Jahre" ist jetzt
 * eine Prop, damit die Altersgrenzen aus der Konfiguration kommen.
 */
export default function CampDatesSection({
  eyebrow,
  heading,
  camps,
  campPrice,
  venueInfoText,
  firstTeamInfoText,
  metaParts,
}: CampDatesSectionProps) {
  const metaLine = metaParts.filter(Boolean).join(' · ')

  return (
    <section id="termine" className="py-20 px-6 bg-gray-50 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-gray-900">{heading}</h2>
        </div>

        {venueInfoText && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-800 mb-1">Veranstaltungsort</p>
            <p>{venueInfoText}</p>
          </div>
        )}

        {firstTeamInfoText && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-800 mb-1">Hinweis zu Trainingseinheiten mit der 1. Mannschaft</p>
            <p>{firstTeamInfoText}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-5">
          {camps.map(c => (
            <div
              key={c.label}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 flex flex-col gap-5 hover:shadow-lg hover:-translate-y-1 hover:border-gray-300 transition-all duration-300"
            >
              <div>
                <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md mb-3">
                  {c.tag}
                </span>
                <p className="font-bold text-gray-900 text-lg mb-1">{c.label}</p>
                <p className="text-[var(--brand-accent)] font-semibold text-sm">{c.date}</p>
                {metaLine && <p className="text-gray-400 text-xs mt-2">{metaLine}</p>}
                <p className="text-gray-900 font-bold text-sm mt-2">{campPrice}</p>
              </div>
              <a
                href={`/?week=${encodeURIComponent(c.value)}#anmeldung`}
                className="mt-auto bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-black active:bg-gray-800 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
              >
                Jetzt anmelden →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
