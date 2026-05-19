import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import ClubLogo from './components/ClubLogo'
import RegistrationForm from './components/RegistrationForm'
import { type CampConfig, fetchCampConfig } from './lib/campConfig'

export const metadata: Metadata = {
  title: 'Fußballschule Sommercamp 2026 – KSV Baunatal',
  description:
    'Melde dein Kind jetzt für das Sommercamp 2026 der Fußballschule KSV Baunatal an. 4 Tage professionelles Training für Kinder von 5–12 Jahren.',
}

const HIGHLIGHTS = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    title: 'Qualifizierte Trainer',
    text: 'Training mit qualifizierten Jugendtrainern und Patenspielern, unterstützt durch Jugendspieler der A- und B-Jugend. Altersgerechtes Konzept mit Technik- und Taktikübungen, abwechslungsreichen Spielformen sowie Teamgeist und Motivation.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    title: 'Training mit Spielern der 1. Mannschaft',
    text: 'Einblicke in den Trainingsalltag auf dem Vereinsgelände des KSV.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z" />
      </svg>
    ),
    title: 'Verpflegung inklusive',
    text: 'Warmes Mittagessen, Obst, Snacks und Getränke sind im Preis enthalten. Kein Extra-Aufwand für Eltern.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
      </svg>
    ),
    title: 'Trikot, Hose & Pokal',
    text: 'Jedes Kind bekommt ein offizielles KSV-Trikot, eine Hose und einen Teilnehmerpokal. Dazu gibt es eine Eintrittskarte für ein Heimspiel der 1. Mannschaft.',
  },
]

const CAMPS = [
  { label: 'Sommercamp I',  date: '29.06. – 02.07.2026', value: '29.06.–02.07.2026', tag: 'Sommer' },
  { label: 'Sommercamp II', date: '03.08. – 06.08.2026', value: '03.08.–06.08.2026', tag: 'Sommer' },
  { label: 'Herbstcamp',    date: '05.10. – 08.10.2026', value: '05.10.–08.10.2026', tag: 'Herbst' },
]

export default async function Page() {
  let config: CampConfig | null = null
  let campPrice = 'Preis auf Anfrage'
  try {
    config = await fetchCampConfig()
    campPrice = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: config.camp.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(config.camp.price_cents / 100)
  } catch (e) {
    console.error('GET /config failed:', e)
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">

      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClubLogo />
            <div>
              <p className="font-bold text-gray-900 text-base leading-tight">KSV Baunatal</p>
              <p className="text-gray-400 text-xs tracking-widest uppercase">Fußballschule</p>
            </div>
          </div>
          <a
            href="#anmeldung"
            className="bg-black text-white text-sm font-semibold px-5 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Jetzt anmelden
          </a>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="bg-gray-950 text-white">
          <div className="max-w-5xl mx-auto px-6 py-24 sm:py-32">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000] inline-block" />
                Sommercamps 2026 · KSV Baunatal
              </span>
              <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
                Fußballschule 2026<br />
                <span className="text-[#CC0000]">beim KSV Baunatal</span>
              </h1>
              <p className="text-gray-300 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl">
                4 Tage professionelles Training, Spaß und Entwicklung
                für Kinder von 5–12 Jahren.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="#anmeldung"
                  className="bg-white text-gray-900 font-bold px-7 py-3.5 rounded-xl hover:bg-gray-100 transition-colors text-center"
                >
                  Jetzt Platz sichern
                </a>
                <a
                  href="#termine"
                  className="bg-white/10 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-white/15 transition-colors text-center"
                >
                  Termine ansehen
                </a>
              </div>

              {/* Schnellfakten */}
              <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 sm:grid-cols-5 gap-6">
                {[
                  { value: '3',          label: 'Camp-Termine 2026' },
                  { value: '4 Tage',     label: 'je Camp' },
                  { value: '5 – 12',     label: 'Jahre' },
                  { value: campPrice,   label: 'Campbeitrag' },
                  { value: 'Baunatal',   label: 'Parkstadion Baunatal' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{f.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{f.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Highlights ──────────────────────────────────────────────── */}
        <section className="py-20 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[#CC0000] text-sm font-semibold tracking-widest uppercase mb-2">Das erwartet euch</p>
              <h2 className="text-3xl font-bold text-gray-900">Warum unser Camp?</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {HIGHLIGHTS.map(h => (
                <div
                  key={h.title}
                  className="rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center mb-4 text-gray-700">
                    {h.icon}
                  </div>
                  <p className="font-semibold text-gray-900 mb-1.5">{h.title}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{h.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Ablauf ──────────────────────────────────────────────────── */}
        <section className="py-20 px-6 bg-gray-950 text-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[#CC0000] text-sm font-semibold tracking-widest uppercase mb-2">Einfach & unkompliziert</p>
              <h2 className="text-3xl font-bold">So läuft die Anmeldung ab</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-10">
              {[
                {
                  step: '01',
                  title: 'Termin wählen',
                  text: 'Wähle einen der verfügbaren Camp-Termine und klicke auf "Anmelden" – der Termin wird im Formular automatisch vorausgewählt.',
                },
                {
                  step: '02',
                  title: 'Anmeldung absenden',
                  text: 'Trage die Daten deines Kindes ein und sende das Formular ab. Die Anmeldung dauert nur wenige Minuten.',
                },
                {
                  step: '03',
                  title: 'Bestätigung & Zahlung',
                  text: 'Du erhältst sofort eine Bestätigungs-E-Mail mit den Bankdaten. Nach Zahlungseingang ist der Platz gesichert.',
                },
              ].map(s => (
                <div key={s.step} className="flex flex-col">
                  <p className="text-6xl font-black text-white/10 leading-none mb-4 tabular-nums">{s.step}</p>
                  <p className="text-base font-bold text-white mb-2">{s.title}</p>
                  <p className="text-sm text-gray-400 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Termine ─────────────────────────────────────────────────── */}
        <section id="termine" className="py-20 px-6 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[#CC0000] text-sm font-semibold tracking-widest uppercase mb-2">Wann findet es statt</p>
              <h2 className="text-3xl font-bold text-gray-900">Termine 2026</h2>
            </div>
            {/* Hinweis: Ort */}
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
              <p className="font-semibold text-gray-800 mb-1">Veranstaltungsort</p>
              <p>
                Kunstrasen am Parkstadion in Baunatal. Bei Bedarf weichen wir auf Ausweichplätze aus,
                z.&nbsp;B. die Sportanlage am Baunsberg.
              </p>
            </div>

            {/* Hinweis: 1. Mannschaft */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
              <p className="font-semibold text-gray-800 mb-1">Hinweis zu Trainingseinheiten mit der 1. Mannschaft</p>
              <p>
                Trainingseinheiten mit Spielern der 1. Mannschaft finden – sofern es zeitlich möglich ist –
                im Rahmen des Camps statt. Wir bitten um Verständnis, dass dies organisatorisch und
                terminlich abhängig ist und daher nicht garantiert werden kann.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-5">
              {CAMPS.map(c => (
                <div
                  key={c.label}
                  className="bg-white rounded-2xl border border-gray-200 p-7 flex flex-col gap-5 hover:shadow-md transition-shadow"
                >
                  <div>
                    <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md mb-3">
                      {c.tag}
                    </span>
                    <p className="font-bold text-gray-900 text-lg mb-1">{c.label}</p>
                    <p className="text-[#CC0000] font-semibold text-sm">{c.date}</p>
                    <p className="text-gray-400 text-xs mt-2">4 Tage · 10:00–15:00 Uhr · Kinder 5–12 Jahre</p>
                    <p className="text-gray-900 font-bold text-sm mt-2">{campPrice}</p>
                  </div>
                  <a
                    href={`/?week=${encodeURIComponent(c.value)}#anmeldung`}
                    className="mt-auto bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-black transition-colors text-center"
                  >
                    Jetzt anmelden →
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Formular ────────────────────────────────────────────────── */}
        <section id="anmeldung" className="py-20 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 max-w-xl mx-auto">
              <p className="text-[#CC0000] text-sm font-semibold tracking-widest uppercase mb-2">Online-Anmeldung</p>
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Platz sichern</h2>
              <p className="text-gray-500 text-base">
                Direkt nach der Anmeldung erhältst du eine Bestätigungs-E-Mail mit allen Zahlungsinformationen.
              </p>
            </div>

            <div className="lg:grid lg:grid-cols-[1fr_288px] lg:gap-10 lg:items-start">

              {/* Formular-Card */}
              <div className="rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10">
                {config ? (
                  <Suspense fallback={<div className="py-10 text-center text-sm text-gray-400">Lädt …</div>}>
                    <RegistrationForm config={config} />
                  </Suspense>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-6 text-sm text-amber-800 space-y-2">
                    {/* TODO(multi-tenant): replace hardcoded email with
                        organization.contact_email when org context is
                        available (Phase 2) */}
                    <p className="font-semibold">Online-Anmeldung vorübergehend nicht verfügbar</p>
                    <p className="text-amber-700 leading-relaxed">
                      Bitte versuchen Sie es in wenigen Minuten erneut oder melden Sie sich direkt bei uns:{' '}
                      <a href="mailto:info@ksv-baunatal.de" className="underline underline-offset-2 font-medium hover:opacity-70">
                        info@ksv-baunatal.de
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar – nur ab lg sichtbar */}
              <aside className="hidden lg:flex flex-col gap-4 sticky top-24">

                {/* Was ist dabei */}
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Im Camp enthalten</p>
                  <ul className="space-y-2.5">
                    {[
                      'KSV-Trikot & Hose',
                      'Teilnehmerpokal',
                      'Warmes Mittagessen, Obst & Snacks',
                      'Eintrittskarte für ein Heimspiel',
                      'Qualifizierte Betreuung',
                    ].map(item => (
                      <li key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
                        <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Nach der Anmeldung */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Nach der Anmeldung</p>
                  <ol className="space-y-2.5 text-sm text-gray-600">
                    {[
                      'E-Mail mit Bankdaten erhalten',
                      'Campbeitrag überweisen',
                      'Platz ist gesichert',
                    ].map((s, i) => (
                      <li key={s} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Kontakt */}
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm">
                  <p className="font-semibold text-gray-800 mb-1.5">Fragen zur Anmeldung?</p>
                  <p className="text-gray-500 leading-relaxed text-xs">
                    Ergün Ünal – Leiter Fußballschule<br />
                    <a href="mailto:Erguen.uenal@fussball.ksv-baunatal.de" className="text-gray-700 hover:underline break-all">
                      Erguen.uenal@fussball.ksv-baunatal.de
                    </a><br />
                    0170 9927281
                  </p>
                </div>

              </aside>
            </div>
          </div>
        </section>

      </main>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#CC0000] text-sm font-semibold tracking-widest uppercase mb-2">Häufige Fragen</p>
            <h2 className="text-3xl font-bold text-gray-900">FAQ für Eltern</h2>
          </div>
          <div className="space-y-3">
            {[
              {
                q: 'Für welches Alter ist das Camp geeignet?',
                a: 'Das Camp richtet sich an Kinder im Alter von 5 bis 12 Jahren.',
              },
              {
                q: 'Was ist im Beitrag enthalten?',
                a: 'Warmes Mittagessen, Obst, Snacks und Getränke, ein offizielles KSV-Trikot und Hose, ein Teilnehmerpokal sowie eine Eintrittskarte für ein Heimspiel der 1. Mannschaft sind im Beitrag inklusive.',
              },
              {
                q: 'Wie bezahle ich?',
                a: 'Die Zahlung erfolgt per Überweisung. Die Bankdaten sowie den Verwendungszweck erhältst du direkt nach der Anmeldung per E-Mail.',
              },
              {
                q: 'Wann gilt die Anmeldung als abgeschlossen?',
                a: 'Die Anmeldung ist vollständig bestätigt, sobald der Campbeitrag auf unserem Konto eingegangen ist.',
              },
              {
                q: 'Können Kinder mit Allergien teilnehmen?',
                a: 'Ja. Bitte trage alle relevanten Allergien und Unverträglichkeiten im Anmeldeformular ein, damit wir entsprechend planen können.',
              },
              {
                q: 'An wen wende ich mich bei Fragen?',
                a: 'Für alle Fragen steht dir Ergün Ünal zur Verfügung: Erguen.uenal@fussball.ksv-baunatal.de · 0170 9927281',
              },
            ].map(faq => (
              <div key={faq.q} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                <p className="font-semibold text-gray-900 text-sm mb-1.5">{faq.q}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-gray-950 text-gray-400 py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <ClubLogo />
                <p className="text-white font-bold">KSV Baunatal</p>
              </div>
              <p className="text-sm leading-relaxed">
                Fußballschule des KSV Baunatal e.V. —
                qualifiziertes Training für Kinder von 5 bis 12 Jahren.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-3 text-sm">Kontakt</p>
              <ul className="space-y-1.5 text-sm">
                <li>KSV Baunatal e.V.</li>
                <li>Leiter Fußballschule: Ergün Ünal</li>
                <li>Erguen.uenal@fussball.ksv-baunatal.de</li>
                <li>0170 9927281</li>
              </ul>
            </div>
            <div>
              <p className="text-white font-semibold mb-3 text-sm">Rechtliches</p>
              <p className="text-sm leading-relaxed" id="datenschutz">
                Deine Daten werden ausschließlich zur Abwicklung der Camp-Anmeldung genutzt.
                Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/datenschutz"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors"
                >
                  Datenschutzerklärung
                </Link>
                <Link
                  href="/impressum"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors"
                >
                  Impressum
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-xs text-gray-600 text-center">
            © 2026 KSV Baunatal e.V. · Alle Rechte vorbehalten
          </div>
        </div>
      </footer>

    </div>
  )
}
