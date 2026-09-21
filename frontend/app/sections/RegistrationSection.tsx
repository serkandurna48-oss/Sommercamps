import type { ReactNode } from 'react'
import { Suspense } from 'react'
import RegistrationForm from '../components/RegistrationForm'
import type { CampConfig } from '../lib/campConfig'

export interface RegistrationSidebarStep {
  label: string
}

interface RegistrationSectionProps {
  eyebrow: string
  heading: string
  intro: string
  /**
   * 'camp'    — echtes Anmeldeformular (KSV): schreibt in das Backend.
   * 'inquiry' — Interims-Zustand ohne Formular (JK): mailto als ehrlicher CTA,
   *             bis CP-JK-101 den realen Anfragefluss liefert.
   */
  mode: 'camp' | 'inquiry'
  /** Nur für mode 'camp'. Fehlt sie, zeigt die Sektion den Störungshinweis. */
  config: CampConfig | null
  contactEmail: string
  /** Überschrift und Zeilen des Kontaktblocks in der Sidebar. */
  contactHeading: string
  contactLines: ReactNode
  /** "Im Camp enthalten" — leer bei Clubs ohne Camp-Paket. */
  includedItems: string[]
  sidebarStepsHeading: string
  sidebarSteps: string[]
  /** Drei Mini-Schritte im Interims-Block (nur mode 'inquiry'). */
  inquirySteps: { step: string; title: string; text: string }[]
}

/**
 * Anmelde- bzw. Anfragesektion inklusive Sidebar.
 * Extrahiert aus page.tsx (CP-JK-103), Markup unverändert. Die Verzweigung
 * bleibt hier bewusst erhalten, betrifft aber nur noch diese eine Sektion und
 * unterscheidet eine Fähigkeit ('camp' vs. 'inquiry'), keinen Mandanten.
 */
export default function RegistrationSection({
  eyebrow,
  heading,
  intro,
  mode,
  config,
  contactEmail,
  contactHeading,
  contactLines,
  includedItems,
  sidebarStepsHeading,
  sidebarSteps,
  inquirySteps,
}: RegistrationSectionProps) {
  return (
    <section id="anmeldung" className="py-20 px-6 bg-white scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10 max-w-xl mx-auto">
          <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{heading}</h2>
          <p className="text-gray-500 text-base">{intro}</p>
        </div>

        <div className="lg:grid lg:grid-cols-[1fr_288px] lg:gap-10 lg:items-start">

          {/* Formular-Card */}
          <div className="rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10">
            {mode === 'camp' && config ? (
              <Suspense fallback={<div className="py-10 text-center text-sm text-gray-400">Lädt …</div>}>
                <RegistrationForm config={config} />
              </Suspense>
                        ) : mode === 'inquiry' ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.5-1.185A8.959 8.959 0 0 1 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                </div>
                <p className="font-bold text-gray-900 text-lg mb-2">Trainingsanfragen bald direkt online möglich</p>
                <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-7">
                  Das Online-Formular ist gerade im Aufbau. Bis dahin melden wir uns persönlich,
                  wenn du uns direkt schreibst.
                </p>
                <div className="grid sm:grid-cols-3 gap-4 max-w-lg mx-auto mb-8 text-left">
                  {inquirySteps.map(s => (
                    <div key={s.step} className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">{s.step}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{s.title}</p>
                        <p className="text-xs text-gray-400 leading-snug">{s.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent('Trainingsanfrage')}`}
                  className="inline-block bg-gray-900 text-white text-sm font-semibold px-7 py-3.5 rounded-xl hover:bg-black active:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                >
                  Anfrage per E-Mail senden
                </a>
                <p className="text-xs text-gray-400 mt-4">Kontakt per Instagram/WhatsApp ist zusätzlich in Vorbereitung.</p>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-6 text-sm text-amber-800 space-y-2">
                <p className="font-semibold">Online-Anmeldung vorübergehend nicht verfügbar</p>
                <p className="text-amber-700 leading-relaxed">
                  Bitte versuchen Sie es in wenigen Minuten erneut oder melden Sie sich direkt bei uns:{' '}
                  <a href={`mailto:${contactEmail}`} className="underline underline-offset-2 font-medium hover:opacity-70 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">
                    {contactEmail}
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Sidebar – nur ab lg sichtbar */}
          <aside className="hidden lg:flex flex-col gap-4 sticky top-24">

            {includedItems.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Im Camp enthalten</p>
                <ul className="space-y-2.5">
                  {includedItems.map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{sidebarStepsHeading}</p>
              <ol className="space-y-2.5 text-sm text-gray-600">
                {sidebarSteps.map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm">
              <p className="font-semibold text-gray-800 mb-1.5">{contactHeading}</p>
              <p className="text-gray-500 leading-relaxed text-xs">{contactLines}</p>
            </div>

          </aside>
        </div>
      </div>
    </section>
  )
}
