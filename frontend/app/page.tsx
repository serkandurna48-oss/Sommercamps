import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import ClubLogo from './components/ClubLogo'
import MediaSlideshow from './components/MediaSlideshow'
import RegistrationForm from './components/RegistrationForm'
import Reveal from './components/Reveal'
import { type CampConfig, fetchCampConfig } from './lib/campConfig'
import {
  CLUB_CONFIG,
  CAMPS,
  PROGRAMS,
  HIGHLIGHTS,
  INCLUDED_ITEMS,
  FAQ_ITEMS,
  VENUE_INFO_TEXT,
  FIRST_TEAM_INFO_TEXT,
  MEMBERSHIP_BENEFITS,
  SLIDESHOW_ITEMS,
} from './lib/clubConfig'
import Image from 'next/image'

// Clubs mit PROGRAMS (z. B. JK) bieten mehr als "das eine Sommercamp" an,
// daher generische Formulierung statt "Sommercamp 2026" in Titel/Beschreibung.
const metaTitle = PROGRAMS.length > 0
  ? `${CLUB_CONFIG.subtitle} – ${CLUB_CONFIG.name}`
  : `${CLUB_CONFIG.subtitle} Sommercamp 2026 – ${CLUB_CONFIG.name}`
const metaDescription = PROGRAMS.length > 0
  ? `Events & Programme der ${CLUB_CONFIG.subtitle} ${CLUB_CONFIG.name} – individuelle Spielerentwicklung für Kinder und Jugendliche.`
  : `Melde dein Kind jetzt für das Sommercamp 2026 der ${CLUB_CONFIG.subtitle} ${CLUB_CONFIG.name} an. 4 Tage professionelles Training für Kinder von 5–12 Jahren.`

// Kein metadataBase gesetzt (Domain für JK noch nicht final) — deshalb bewusst kein
// og:image mit relativer URL, das würde Next zu einer localhost-Warnung im Build führen.
export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    siteName: CLUB_CONFIG.name,
    locale: 'de_DE',
    type: 'website',
  },
}

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

  // Terminierte, hervorgehobene Angebote (z. B. aktuelle Sommercamps) getrennt von
  // generischen Auf-Anfrage-Programmen, damit das Angebot leichter verständlich ist.
  const featuredPrograms = PROGRAMS.filter(p => p.featured)
  const otherPrograms = PROGRAMS.filter(p => !p.featured)

  return (
    <div
      className="min-h-screen bg-white text-gray-900 flex flex-col"
      style={{ '--brand-accent': CLUB_CONFIG.accentColor ?? '#CC0000' } as CSSProperties}
    >
      {/* Strukturierte Daten für Suchmaschinen — Werte kommen ausschließlich aus
          clubConfig, keine Nutzereingaben. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsActivityLocation',
            name: CLUB_CONFIG.name,
            description: metaDescription,
            areaServed: CLUB_CONFIG.venueName,
          }),
        }}
      />

      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ClubLogo />
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base leading-tight truncate">{CLUB_CONFIG.name}</p>
              <p className="text-gray-400 text-xs tracking-widest uppercase truncate">{CLUB_CONFIG.subtitle}</p>
            </div>
          </div>
          <a
            href="#anmeldung"
            className="bg-black text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-xl hover:opacity-90 active:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 shrink-0 whitespace-nowrap"
          >
            <span className="sm:hidden">{PROGRAMS.length > 0 ? 'Anfrage' : 'Anmelden'}</span>
            <span className="hidden sm:inline">{PROGRAMS.length > 0 ? 'Trainingsanfrage stellen' : 'Jetzt anmelden'}</span>
          </a>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gray-950 text-white">
          {CLUB_CONFIG.heroImageSrc && (
            <div className="absolute inset-0 z-0">
              <Image
                src={CLUB_CONFIG.heroImageSrc}
                alt=""
                fill
                priority
                unoptimized
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 via-gray-950/35 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/60 via-transparent to-transparent" />
            </div>
          )}
          <div className={`relative z-10 max-w-5xl mx-auto px-6 ${PROGRAMS.length > 0 ? 'py-20 sm:py-28' : 'py-24 sm:py-32'}`}>
            <div className={PROGRAMS.length > 0 ? 'max-w-xl' : 'max-w-2xl'}>
              <span className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-accent)] inline-block" />
                {PROGRAMS.length > 0 ? 'Aktuelle Sommercamps' : 'Sommercamps 2026'} · {CLUB_CONFIG.name}
              </span>
              <h1 className={`text-4xl ${PROGRAMS.length > 0 ? 'sm:text-5xl lg:text-6xl' : 'sm:text-6xl'} font-extrabold leading-[1.1] tracking-tight mb-6`}>
                {PROGRAMS.length > 0 && CLUB_CONFIG.heroTagline ? (
                  CLUB_CONFIG.heroTagline
                ) : (
                  <>
                    {CLUB_CONFIG.subtitle} 2026<br />
                    <span className="text-[var(--brand-accent)]">beim {CLUB_CONFIG.name}</span>
                  </>
                )}
              </h1>
              <p className="text-gray-300 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl">
                {PROGRAMS.length > 0
                  ? 'Individuelles Training. Starke Camps. Dein nächstes Level.'
                  : '4 Tage professionelles Training, Spaß und Entwicklung für Kinder von 5–12 Jahren.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="#anmeldung"
                  className="bg-white text-gray-900 font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  {PROGRAMS.length > 0 ? 'Trainingsanfrage stellen' : 'Jetzt Platz sichern'}
                </a>
                <a
                  href="#termine"
                  className="border border-white/40 bg-white/5 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/15 hover:border-white/60 active:bg-white/20 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  {PROGRAMS.length > 0 ? 'Aktuelle Sommercamps ansehen' : 'Termine ansehen'}
                </a>
                {PROGRAMS.length > 0 && (
                  <a
                    href="#mitgliedschaft"
                    className="border border-white/40 bg-white/5 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/15 hover:border-white/60 active:bg-white/20 transition-colors text-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  >
                    Mitgliedschaft
                  </a>
                )}
              </div>

              {PROGRAMS.length > 0 && (
                <p className="mt-4 text-xs sm:text-sm text-gray-400">
                  Für Spielerinnen und Spieler · Individuelle Spielerentwicklung · Training in deiner Region
                </p>
              )}

              {/* Schnellfakten. PROGRAMS-Zweig zeigt bewusst keinen Preis: campPrice kommt
                  aus dem geteilten KSV-Backend (/config) und hat keinen Bezug zu JKs
                  gestaffelten Camp-Preisen (149 €/169 € je Camp, sonst "Auf Anfrage"). */}
              <div className={`mt-12 pt-8 border-t border-white/10 grid grid-cols-2 ${PROGRAMS.length > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-5'} gap-6`}>
                {(PROGRAMS.length > 0
                  ? [
                      { value: String(PROGRAMS.length), label: 'Programme & Formate' },
                      { value: String(featuredPrograms.length), label: 'Aktuelle Camps' },
                      { value: 'Flexibel', label: 'Trainingsformate' },
                      { value: CLUB_CONFIG.venueName, label: 'Standort' },
                    ]
                  : [
                      { value: '3',          label: 'Camp-Termine 2026' },
                      { value: '4 Tage',     label: 'je Camp' },
                      { value: '5 – 12',     label: 'Jahre' },
                      { value: campPrice,   label: 'Campbeitrag' },
                      { value: CLUB_CONFIG.venueName, label: 'Standort' },
                    ]
                ).map(f => (
                  <div key={f.label}>
                    <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{f.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{f.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {PROGRAMS.length > 0 ? (
          <>
            {/* Full-bleed, kein Card-Wrapper: setzt die Foto-Erzählung aus dem Hero
                nahtlos fort statt sie in einer weißen Box abzubrechen. */}
            {SLIDESHOW_ITEMS.length > 0 && (
              <section className="bg-gray-950">
                <MediaSlideshow items={SLIDESHOW_ITEMS} />
              </section>
            )}

            {/* ── Aktuelle Sommercamps (hochgezogen, navy für Energie/Kontrast) ── */}
            <section id="termine" className="relative overflow-hidden py-20 px-6 bg-gray-950 text-white scroll-mt-20">
              <div className="absolute inset-0 z-0">
                <Image src="/jk/camp.jpg" alt="" fill unoptimized className="object-cover object-top" />
                <div className="absolute inset-0 bg-gray-950/70" />
              </div>
              <div className="relative z-10 max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Jetzt aktuell</p>
                  <h2 className="text-3xl font-bold">Aktuelle Sommercamps</h2>
                </div>

                {VENUE_INFO_TEXT && (
                  <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-gray-300 leading-relaxed">
                    <p className="font-semibold text-white mb-1">Veranstaltungsort</p>
                    <p>{VENUE_INFO_TEXT}</p>
                  </div>
                )}
                {FIRST_TEAM_INFO_TEXT && (
                  <div className="mb-8 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-gray-300 leading-relaxed">
                    <p className="font-semibold text-white mb-1">Hinweis zu Trainingseinheiten mit der 1. Mannschaft</p>
                    <p>{FIRST_TEAM_INFO_TEXT}</p>
                  </div>
                )}

                {featuredPrograms.length > 0 && (
                  <Reveal className="grid sm:grid-cols-2 gap-5">
                    {featuredPrograms.map(p => (
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
                          href="#anmeldung"
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

            {/* ── Weitere Angebote ─────────────────────────────────────────── */}
            {otherPrograms.length > 0 && (
              <section className="py-16 px-6 bg-gray-50">
                <div className="max-w-5xl mx-auto">
                  <div className="text-center mb-10">
                    <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Auf Anfrage</p>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Weitere Angebote</h2>
                  </div>
                  <div className={`grid sm:grid-cols-2 gap-5 ${otherPrograms.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                    {otherPrograms.map(p => (
                      <div
                        key={p.title}
                        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 flex flex-col gap-3 hover:shadow-lg hover:-translate-y-1 hover:border-gray-300 transition-all duration-300"
                      >
                        <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md w-fit">
                          {p.tag ?? p.category}
                        </span>
                        <p className="font-bold text-gray-900 text-lg">{p.title}</p>
                        <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
                        <p className="text-[var(--brand-accent)] font-semibold text-sm">{p.cadence}</p>
                        <a
                          href="#anmeldung"
                          className="mt-auto bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-black active:bg-gray-800 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                        >
                          Angebot anfragen →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Warum JK? (Bild + Karten, mehr Academy-Atmosphäre) ─────────── */}
            <section className="py-20 px-6 bg-white">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Warum JK?</p>
                  <h2 className="text-3xl font-bold text-gray-900">Für Spieler, die mehr wollen</h2>
                </div>
                <Reveal className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:items-stretch">
                  <div className="relative rounded-2xl overflow-hidden h-72 sm:h-96 lg:h-auto mb-8 lg:mb-0">
                    <Image src="/jk/team.jpg" alt="" fill unoptimized className="object-cover" />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
                    {HIGHLIGHTS.map(h => (
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

            {/* ── Ablauf (kompakt, keine dominante Sektion mehr) ──────────── */}
            <section className="py-12 px-6 bg-white border-t border-gray-100">
              <div className="max-w-5xl mx-auto">
                <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">So einfach geht’s</p>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    { step: '1', title: 'Anfrage stellen', text: 'Sag uns, was dich interessiert.' },
                    { step: '2', title: 'Wir melden uns', text: 'Persönlich, meist innerhalb weniger Tage.' },
                    { step: '3', title: 'Loslegen', text: 'Training, Camp oder Event vereinbaren.' },
                  ].map(s => (
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

            {/* ── Mitgliedschaft ───────────────────────────────────────────
                Ehrlich und ausdrücklich: keine Online-Anmeldung/Mitgliedschaft
                heute möglich, nur ein Interesse-Kontakt per Mailto. */}
            <section id="mitgliedschaft" className="py-16 px-6 bg-gray-50 scroll-mt-20">
              <div className="max-w-5xl mx-auto">
                <Reveal className="rounded-2xl border-2 border-[var(--brand-accent)] bg-white p-8 sm:p-10 text-center max-w-2xl mx-auto shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-[var(--brand-accent)]">
                    <Image src="/jk/training.jpg" alt="" fill unoptimized className="object-cover" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Mitgliedschaft in Vorbereitung</h2>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    Du möchtest Teil der JK Performance Academy werden? Die Mitgliedschaft ist aktuell in Vorbereitung.
                    Schreib uns bei Interesse – wir informieren dich, sobald der Prozess startet.
                  </p>
                  {MEMBERSHIP_BENEFITS.length > 0 && (
                    <ul className="text-left space-y-2 mb-8 max-w-sm mx-auto">
                      {MEMBERSHIP_BENEFITS.map(b => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700">
                          <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">✓</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a
                    href={`mailto:${CLUB_CONFIG.contactEmail}?subject=${encodeURIComponent('Interesse an Mitgliedschaft')}`}
                    className="inline-block bg-gray-900 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-black active:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                  >
                    Interesse an Mitgliedschaft melden
                  </a>
                </Reveal>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* ── Highlights ──────────────────────────────────────────────── */}
            <section className="py-20 px-6 bg-white">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Das erwartet euch</p>
                  <h2 className="text-3xl font-bold text-gray-900">Warum unser Camp?</h2>
                </div>
                <div className={`grid sm:grid-cols-2 gap-5 ${HIGHLIGHTS.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                  {HIGHLIGHTS.map(h => (
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

            {/* ── Ablauf ──────────────────────────────────────────────────── */}
            <section className="py-20 px-6 bg-gray-950 text-white">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-14">
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Einfach & unkompliziert</p>
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
            <section id="termine" className="py-20 px-6 bg-gray-50 scroll-mt-20">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Wann findet es statt</p>
                  <h2 className="text-3xl font-bold text-gray-900">Termine 2026</h2>
                </div>
                {/* Hinweis: Ort */}
                {VENUE_INFO_TEXT && (
                  <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
                    <p className="font-semibold text-gray-800 mb-1">Veranstaltungsort</p>
                    <p>{VENUE_INFO_TEXT}</p>
                  </div>
                )}

                {/* Hinweis: 1. Mannschaft */}
                {FIRST_TEAM_INFO_TEXT && (
                  <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600 leading-relaxed">
                    <p className="font-semibold text-gray-800 mb-1">Hinweis zu Trainingseinheiten mit der 1. Mannschaft</p>
                    <p>{FIRST_TEAM_INFO_TEXT}</p>
                  </div>
                )}

                <div className="grid sm:grid-cols-3 gap-5">
                  {CAMPS.map(c => (
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
                        <p className="text-gray-400 text-xs mt-2">4 Tage · 10:00–15:00 Uhr · Kinder 5–12 Jahre</p>
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
          </>
        )}

        {/* ── Formular ────────────────────────────────────────────────── */}
        <section id="anmeldung" className="py-20 px-6 bg-white scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 max-w-xl mx-auto">
              {PROGRAMS.length > 0 ? (
                <>
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Trainingsanfrage</p>
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Anfrage stellen</h2>
                  <p className="text-gray-500 text-base">
                    Schreib uns, welches Programm dich interessiert – wir melden uns bei dir.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">Online-Anmeldung</p>
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Platz sichern</h2>
                  <p className="text-gray-500 text-base">
                    Direkt nach der Anmeldung erhältst du eine Bestätigungs-E-Mail mit allen Zahlungsinformationen.
                  </p>
                </>
              )}
            </div>

            <div className="lg:grid lg:grid-cols-[1fr_288px] lg:gap-10 lg:items-start">

              {/* Formular-Card */}
              <div className="rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10">
                {PROGRAMS.length === 0 && config ? (
                  <Suspense fallback={<div className="py-10 text-center text-sm text-gray-400">Lädt …</div>}>
                    <RegistrationForm config={config} />
                  </Suspense>
                ) : PROGRAMS.length > 0 ? (
                  // Reines Draft-Preview: es gibt noch kein echtes Anfrageformular.
                  // Realer Trainingsanfrage-Flow ist als Folge-Ticket CP-JK-101
                  // ("Training Inquiry Flow") vorgesehen. Bis dahin: E-Mail als echter
                  // Interims-CTA statt einer reinen "kommt bald"-Sackgasse.
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
                      {[
                        { step: '1', title: 'Nachricht senden', text: 'Per E-Mail an uns' },
                        { step: '2', title: 'Wir melden uns', text: 'Meist innerhalb weniger Tage' },
                        { step: '3', title: 'Loslegen', text: 'Programm & Termin abstimmen' },
                      ].map(s => (
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
                      href={`mailto:${CLUB_CONFIG.contactEmail}?subject=${encodeURIComponent('Trainingsanfrage')}`}
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
                      <a href={`mailto:${CLUB_CONFIG.contactEmail}`} className="underline underline-offset-2 font-medium hover:opacity-70 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">
                        {CLUB_CONFIG.contactEmail}
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar – nur ab lg sichtbar */}
              <aside className="hidden lg:flex flex-col gap-4 sticky top-24">

                {/* Was ist dabei — nur wenn ein Camp-Paket existiert (nicht bei PROGRAMS-Clubs wie JK) */}
                {INCLUDED_ITEMS.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Im Camp enthalten</p>
                    <ul className="space-y-2.5">
                      {INCLUDED_ITEMS.map(item => (
                        <li key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
                          <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 text-[10px] font-bold">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nach der Anmeldung / So geht's weiter */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    {PROGRAMS.length > 0 ? 'So geht’s weiter' : 'Nach der Anmeldung'}
                  </p>
                  <ol className="space-y-2.5 text-sm text-gray-600">
                    {(PROGRAMS.length > 0
                      ? ['Anfrage senden', 'Wir melden uns bei dir', 'Programm & Termin abstimmen']
                      : ['E-Mail mit Bankdaten erhalten', 'Campbeitrag überweisen', 'Platz ist gesichert']
                    ).map((s, i) => (
                      <li key={s} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Kontakt */}
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm">
                  <p className="font-semibold text-gray-800 mb-1.5">
                    {PROGRAMS.length > 0 ? 'Fragen zu unseren Programmen?' : 'Fragen zur Anmeldung?'}
                  </p>
                  <p className="text-gray-500 leading-relaxed text-xs">
                    {PROGRAMS.length > 0 ? (
                      <>
                        {CLUB_CONFIG.contactName}<br />
                        Kontakt per Instagram/WhatsApp in Vorbereitung
                      </>
                    ) : (
                      <>
                        {CLUB_CONFIG.contactName} – Leiter {CLUB_CONFIG.subtitle}<br />
                        <a href={`mailto:${CLUB_CONFIG.contactEmail}`} className="text-gray-700 hover:underline break-all rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-1">
                          {CLUB_CONFIG.contactEmail}
                        </a><br />
                        {CLUB_CONFIG.contactPhone}
                      </>
                    )}
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
            <p className="text-[var(--brand-accent)] text-sm font-semibold tracking-widest uppercase mb-2">
              {PROGRAMS.length > 0 ? 'Fragen & Antworten' : 'Häufige Fragen'}
            </p>
            <h2 className="text-3xl font-bold text-gray-900">
              {PROGRAMS.length > 0 ? 'Häufige Fragen' : 'FAQ für Eltern'}
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map(faq => (
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

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-gray-950 text-gray-400 py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <ClubLogo />
                <p className="text-white font-bold">{CLUB_CONFIG.name}</p>
              </div>
              <p className="text-sm leading-relaxed">
                {PROGRAMS.length > 0
                  ? `${CLUB_CONFIG.subtitle} der ${CLUB_CONFIG.name} — individuelle Spielerentwicklung für Kinder und Jugendliche.`
                  : `${CLUB_CONFIG.subtitle} des ${CLUB_CONFIG.name} e.V. — qualifiziertes Training für Kinder von 5 bis 12 Jahren.`}
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-3 text-sm">Kontakt</p>
              <ul className="space-y-1.5 text-sm">
                <li>{CLUB_CONFIG.name}{PROGRAMS.length > 0 ? '' : ' e.V.'}</li>
                {PROGRAMS.length > 0 ? (
                  <li>Kontakt per Instagram/WhatsApp in Vorbereitung</li>
                ) : (
                  <>
                    <li>Leiter {CLUB_CONFIG.subtitle}: {CLUB_CONFIG.contactName}</li>
                    <li>{CLUB_CONFIG.contactEmail}</li>
                    <li>{CLUB_CONFIG.contactPhone}</li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <p className="text-white font-semibold mb-3 text-sm">Rechtliches</p>
              <p className="text-sm leading-relaxed" id="datenschutz">
                Deine Daten werden ausschließlich zur Bearbeitung {PROGRAMS.length > 0 ? 'deiner Anfrage' : 'der Camp-Anmeldung'} genutzt.
                Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/datenschutz"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  Datenschutzerklärung
                </Link>
                <Link
                  href="/impressum"
                  className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  Impressum
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-xs text-gray-600 text-center">
            © 2026 {CLUB_CONFIG.name}{PROGRAMS.length > 0 ? '' : ' e.V.'} · Alle Rechte vorbehalten
          </div>
        </div>
      </footer>

    </div>
  )
}
