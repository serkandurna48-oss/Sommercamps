import Image from 'next/image'
import Reveal from '../components/Reveal'

interface MembershipSectionProps {
  heading: string
  text: string
  benefits: string[]
  ctaLabel: string
  ctaHref: string
  /** Begleitbild. Kommt aus der Mandantenkonfiguration, nicht mehr hartkodiert. */
  portraitSrc?: string
}

/**
 * Mitgliedschafts-Teaser (bisheriger PROGRAMS-Zweig).
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 *
 * Hinweis für die Umsetzung von Richtung B: Diese Sektion entfällt laut
 * Designfreigabe von der Startseite, solange es keine funktionierende
 * Warteliste gibt (siehe docs/design/jk-redesign-b-handoff.md, Abschnitt 11).
 * Sie bleibt hier erhalten, weil dieser Schritt ausschließlich extrahiert und
 * noch nichts an der Darstellung ändert.
 */
export default function MembershipSection({
  heading,
  text,
  benefits,
  ctaLabel,
  ctaHref,
  portraitSrc,
}: MembershipSectionProps) {
  return (
    <section id="mitgliedschaft" className="py-16 px-6 bg-gray-50 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <Reveal className="rounded-2xl border-2 border-[var(--brand-accent)] bg-white p-8 sm:p-10 text-center max-w-2xl mx-auto shadow-sm hover:shadow-md transition-shadow duration-300">
          {portraitSrc && (
            <div className="relative w-16 h-16 rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-[var(--brand-accent)]">
              <Image src={portraitSrc} alt="" fill unoptimized className="object-cover" />
            </div>
          )}
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{heading}</h2>
          <p className="text-gray-600 leading-relaxed mb-6">{text}</p>
          {benefits.length > 0 && (
            <ul className="text-left space-y-2 mb-8 max-w-sm mx-auto">
              {benefits.map(b => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          )}
          <a
            href={ctaHref}
            className="inline-block bg-gray-900 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-black active:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
          >
            {ctaLabel}
          </a>
        </Reveal>
      </div>
    </section>
  )
}
