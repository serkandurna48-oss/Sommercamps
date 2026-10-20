'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice, orgShortCode } from '../../lib/parentFlowFormat'
import CampRow from './CampRow'
import RegistrationFormScreen from './RegistrationFormScreen'
import DoneScreen from './DoneScreen'
import { useParentFlowMotion } from './motion'
import { publicUI } from '../../lib/i18n/de'

type ScreenName = 'org' | 'camp' | 'form' | 'done' | 'wait'

export function headlineScale(text: string): 'xl' | 'lg' | 'md' {
  const len = text.length
  if (len <= 24) return 'xl'
  if (len <= 48) return 'lg'
  return 'md'
}

interface DoneState {
  result: RegistrationCreated
  childName: string
  parentEmail: string
}

export default function ParentFlow({ org, camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
  const router = useRouter()
  const [screen, setScreen] = useState<ScreenName>('org')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)
  // Muss vor jedem early return stehen (Rules of Hooks) — greift nur, wenn
  // der org-Screen tatsächlich gerendert ist (ref sonst null, No-op im Hook).
  const orgContainerRef = useRef<HTMLElement>(null)
  useParentFlowMotion(org.theme, orgContainerRef)

  const selectedCamp = useMemo(() => camps.find((c) => c.slug === selectedSlug) ?? null, [camps, selectedSlug])
  const shortCode = orgShortCode(org.name)
  const contactName = `Camp-Team ${org.name}`

  const campsByYear = useMemo(() => {
    const years = new Set(camps.map((c) => c.start_date.slice(0, 4)))
    return years.size === 1 ? [...years][0] : null
  }, [camps])

  function openCamp(camp: CampPublic) {
    setSelectedSlug(camp.slug)
    setScreen(camp.is_full ? 'wait' : 'camp')
    window.scrollTo(0, 0)
  }

  function goForm() {
    setScreen('form')
    window.scrollTo(0, 0)
  }

  function backToOrg() {
    router.refresh()
    setScreen('org')
    setSelectedSlug(null)
    setDone(null)
    window.scrollTo(0, 0)
  }

  function scrollToCamps() {
    if (camps.length === 1) {
      openCamp(camps[0])
    } else {
      document.getElementById('s-camps')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (screen === 'form' && selectedCamp) {
    return (
      <RegistrationFormScreen
        orgSlug={org.slug}
        orgName={org.name}
        hasBankDetails={Boolean(org.iban)}
        camp={selectedCamp}
        onBack={() => {
          setScreen(selectedCamp.is_full ? 'wait' : 'camp')
          window.scrollTo(0, 0)
        }}
        onSubmitted={(result, childName, parentEmail) => {
          setDone({ result, childName, parentEmail })
          setScreen('done')
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  if (screen === 'done' && done && selectedCamp) {
    return (
      <DoneScreen
        org={org}
        camp={selectedCamp}
        result={done.result}
        childName={done.childName}
        parentEmail={done.parentEmail}
        onBackToOrg={backToOrg}
      />
    )
  }

  if (screen === 'camp' && selectedCamp) {
    return <CampScreen org={org} camp={selectedCamp} onBack={backToOrg} onRegister={goForm} />
  }

  if (screen === 'wait' && selectedCamp) {
    return (
      <WaitScreen
        org={org}
        camp={selectedCamp}
        alternatives={camps.filter((c) => c.slug !== selectedCamp.slug && !c.is_full).slice(0, 2)}
        onBack={backToOrg}
        onJoinWaitlist={goForm}
        onSelectAlternative={openCamp}
      />
    )
  }

  // Themes control presentation; content belongs to the organization.
  const hero = org.hero_image_url?.trim()
  const heading = org.intro_heading?.trim() || org.name
  const intro = org.intro_text?.trim() || 'Alle Camps auf einen Blick — wählen Sie unten den passenden Termin für Ihr Kind.'

  return (
    <section className="screen" id="s-org" ref={orgContainerRef}>
      {org.theme === 'tradition' && (() => {
        const ageMin = camps.length > 0 ? Math.min(...camps.map(c => c.age_min)) : null
        const ageMax = camps.length > 0 ? Math.max(...camps.map(c => c.age_max)) : null
        const totalSeats = camps.reduce((s, c) => s + c.capacity, 0)
        return (
          <header className="hero h-trad" lang="de">
            <nav className="h-trad-nav" aria-label="Seitennavigation">
              <div className="nav-left">
                <span className="nav-logo-trad">
                  {org.logo_url
                    ? <Image src={org.logo_url} alt={org.name} width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : shortCode}
                </span>
                <span className="nav-name-trad">{org.name}</span>
              </div>
              <button className="nav-cta-brand" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
            </nav>
            {hero && (
              <div className="h-trad-shot">
                <Image id="shotA" src={hero} alt="" unoptimized fill priority style={{ objectFit: 'cover', objectPosition: 'center 25%' }} />
              </div>
            )}
            <div className="h-trad-in">
              <div className="in-main">
                <span className="hero-label">{org.name}</span>
                <h1 className="d1" data-split data-scale={headlineScale(heading)}>{heading}</h1>
                <p className="intro">{intro}</p>
                <div className="hero-btns">
                  <button className="h-btn-line" type="button" onClick={scrollToCamps}>Camps ansehen</button>
                  <button className="h-btn-brand" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
                </div>
              </div>
              {camps.length > 0 && (
                <div className="h-trad-stats">
                  <div className="hstat-w">
                    <b className="num" data-count={camps.length}>{camps.length}</b>
                    <span>{camps.length === 1 ? 'Camp' : 'Camps'}</span>
                  </div>
                  {ageMin !== null && ageMax !== null && (
                    <div className="hstat-w">
                      <b className="num">{ageMin}–{ageMax}</b>
                      <span>Jahre</span>
                    </div>
                  )}
                  <div className="hstat-w">
                    <b className="num" data-count={totalSeats}>{totalSeats}</b>
                    <span>Plätze gesamt</span>
                  </div>
                </div>
              )}
            </div>
          </header>
        )
      })()}

      {org.theme === 'akademie' && (() => {
        const ageMin = camps.length > 0 ? Math.min(...camps.map(c => c.age_min)) : null
        const ageMax = camps.length > 0 ? Math.max(...camps.map(c => c.age_max)) : null
        const totalSeats = camps.reduce((s, c) => s + c.capacity, 0)
        return (
          <header className="hero h-akad" lang="de">
            <nav className="h-akad-nav" aria-label="Seitennavigation">
              <div className="nav-left">
                <span className="nav-logo">
                  {org.logo_url
                    ? <Image src={org.logo_url} alt={org.name} width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : shortCode}
                </span>
                <span className="nav-name">{org.name}</span>
              </div>
              <button className="nav-cta" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
            </nav>
            <div className="bg">{hero && <Image id="shotB" src={hero} alt="" unoptimized fill priority style={{ objectFit: 'cover' }} />}</div>
            <div className="veil" />
            <div className="in">
              <div className="in-main">
                <span className="hero-label">{org.name}</span>
                <h1 className="d1" data-split data-scale={headlineScale(heading)}>{heading}</h1>
                <p className="intro">{intro}</p>
                <div className="hero-btns">
                  <button className="h-btn-glass" type="button" onClick={scrollToCamps}>Camps ansehen</button>
                  <button className="h-btn-solid" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
                </div>
              </div>
              {camps.length > 0 && (
                <div className="hero-stats">
                  <div className="hstat">
                    <b className="num" data-count={camps.length}>{camps.length}</b>
                    <span>{camps.length === 1 ? 'Camp' : 'Camps'}</span>
                  </div>
                  {ageMin !== null && ageMax !== null && (
                    <div className="hstat">
                      <b className="num">{ageMin}–{ageMax}</b>
                      <span>Jahre</span>
                    </div>
                  )}
                  <div className="hstat">
                    <b className="num" data-count={totalSeats}>{totalSeats}</b>
                    <span>Plätze gesamt</span>
                  </div>
                  <span className="hero-assure">Anmeldung in ca. 4 Minuten — kein Konto nötig</span>
                </div>
              )}
            </div>
          </header>
        )
      })()}

      {org.theme === 'kompakt' && (() => {
        const ageMin = camps.length > 0 ? Math.min(...camps.map(c => c.age_min)) : null
        const ageMax = camps.length > 0 ? Math.max(...camps.map(c => c.age_max)) : null
        const totalSeats = camps.reduce((s, c) => s + c.capacity, 0)
        return (
          <header className="hero h-komp" lang="de">
            <nav className="h-trad-nav h-komp-nav" aria-label="Seitennavigation">
              <div className="nav-left">
                <span className="nav-logo-trad">
                  {org.logo_url
                    ? <Image src={org.logo_url} alt={org.name} width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : shortCode}
                </span>
                <span className="nav-name-trad">{org.name}</span>
              </div>
              <button className="nav-cta-brand" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
            </nav>
            <div className="h-komp-in">
              <div className="in-main">
                <span className="hero-label">{org.name}</span>
                <h1 className="d1" data-split data-scale={headlineScale(heading)}>{heading}</h1>
                <p className="intro">{intro}</p>
                <div className="hero-btns">
                  <button className="h-btn-line" type="button" onClick={scrollToCamps}>Camps ansehen</button>
                  <button className="h-btn-brand" type="button" onClick={scrollToCamps}>Jetzt anmelden</button>
                </div>
              </div>
              {camps.length > 0 && (
                <div className="h-komp-stats">
                  <div className="hstat-w hstat-w-dark">
                    <b className="num" data-count={camps.length}>{camps.length}</b>
                    <span>{camps.length === 1 ? 'Camp' : 'Camps'}</span>
                  </div>
                  {ageMin !== null && ageMax !== null && (
                    <div className="hstat-w hstat-w-dark">
                      <b className="num">{ageMin}–{ageMax}</b>
                      <span>Jahre</span>
                    </div>
                  )}
                  <div className="hstat-w hstat-w-dark">
                    <b className="num" data-count={totalSeats}>{totalSeats}</b>
                    <span>Plätze gesamt</span>
                  </div>
                </div>
              )}
            </div>
          </header>
        )
      })()}

      {camps.length > 0 && (
        <div className="factsstrip pad">
          <div className="factsstrip-in">
            <div className="fstat">
              <b className="num">{camps.length}</b>
              <span>{camps.length === 1 ? 'Camp' : 'Camps'}</span>
            </div>
            {(() => {
              const ageMin = Math.min(...camps.map(c => c.age_min))
              const ageMax = Math.max(...camps.map(c => c.age_max))
              return (
                <div className="fstat">
                  <b className="num">{ageMin}–{ageMax}</b>
                  <span>Jahre</span>
                </div>
              )
            })()}
            {(() => {
              const locs = [...new Set(camps.map(c => c.location).filter(Boolean))]
              return locs.length > 0 ? (
                <div className="fstat fstat-loc">
                  <b>{locs.join(' · ')}</b>
                  <span>{locs.length === 1 ? 'Ort' : 'Orte'}</span>
                </div>
              ) : null
            })()}
          </div>
        </div>
      )}

      <div className="assure">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.55 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>Die Anmeldung dauert etwa vier Minuten. Sie brauchen kein Benutzerkonto.</span>
      </div>

      <div className="pad sec" id="s-camps">
        <div className="sec-head">
          <div>
            <span className="sec-label">{camps.length} {camps.length === 1 ? 'Termin' : 'Termine'}</span>
            <h2 className="d2" data-split>Camps{campsByYear ? ` ${campsByYear}` : ''}</h2>
          </div>
        </div>
        <div className="camps">
          {camps.length === 0 ? (
            <p className="muted" style={{ padding: '24px 0' }}>
              Aktuell sind keine Camps veröffentlicht.
            </p>
          ) : (
            camps.map((camp) => <CampRow key={camp.slug} camp={camp} onSelect={openCamp} />)
          )}
        </div>
      </div>

      {org.trainer_image_url?.trim() && (
        <div className="pad sec" data-section>
          <div className="sec-head" style={{ marginBottom: 24 }}>
            <span className="sec-label">{publicUI.trainer.heading}</span>
          </div>
          <div className="trainer-sec" data-rise>
            <Image
              src={org.trainer_image_url}
              alt={org.contact_person_name ?? ''}
              unoptimized
              width={120}
              height={120}
              className="trainer-img"
              style={{ objectFit: 'cover' }}
            />
            <div className="trainer-body">
              {org.contact_person_name && <h2 className="trainer-name">{org.contact_person_name}</h2>}
              {org.trainer_text?.trim() && <p className="trainer-bio">{org.trainer_text}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="pad how-sec">
        <div>
          <span className="sec-label">In 3 Schritten</span>
          <h2 className="d2" data-split>{publicUI.howItWorks.heading}</h2>
        </div>
        <div className="how-steps">
          {publicUI.howItWorks.steps.map((step) => (
            <div key={step.num} className="how-step" data-rise>
              <span className="how-num">{step.num}</span>
              <h3 className="d3">{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pad faq-sec">
        <div>
          <span className="sec-label">FAQ</span>
          <h2 className="d2" data-split>Häufige Fragen</h2>
        </div>
        <div className="faq">
          {publicUI.faq.map((item, i) => (
            <details key={i} className="faq-item" data-rise>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: 40 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-rise>
          <h2 className="d3">Fragen zum Camp?</h2>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            Schreiben Sie dem Camp-Team. Wir antworten in der Regel am selben Tag.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}>
            <span className="muted">{contactName}</span>
            <a href={`mailto:${org.contact_email}`} style={{ fontWeight: 600, color: 'var(--brand-strong)' }}>
              {org.contact_email}
            </a>
            {org.contact_phone && <span className="muted">{org.contact_phone}</span>}
          </div>
        </div>
      </div>

      <PublicFooter orgSlug={org.slug} />
    </section>
  )
}

export function CampScreen({
  org,
  camp,
  onBack,
  onRegister,
}: {
  org: OrganizationPublic
  camp: CampPublic
  onBack: () => void
  onRegister: () => void
}) {
  const pct = camp.capacity > 0 ? Math.round((camp.registered_count / camp.capacity) * 100) : 0
  const tight = !camp.is_full && camp.spots_remaining <= 3
  const containerRef = useRef<HTMLElement>(null)
  useParentFlowMotion(org.theme, containerRef)
  const startDay = parseInt(camp.start_date.slice(8, 10))
  const startMonth = new Date(camp.start_date + 'T12:00:00').toLocaleString('de-DE', { month: 'long' })

  return (
    <section className="screen" id="s-camp" ref={containerRef}>
      <div className="camp-back pad">
        <button className="back-link" type="button" onClick={onBack} aria-label="Zurück zur Übersicht">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Zurück zur Übersicht
        </button>
      </div>

      <div className="camp-hd pad">
        <div className="camp-hd-in">
          <div className="camp-hd-main">
            <span className="sec-label">
              {[camp.location, formatCampDateRange(camp.start_date, camp.end_date)].filter(Boolean).join(' · ')}
            </span>
            <h1 className="d1" data-split data-scale={headlineScale(camp.title)} lang="de">
              {camp.title}
            </h1>
            <p className="camp-hd-intro">
              {camp.age_min}–{camp.age_max} Jahre
            </p>
          </div>
          <div className="camp-date-block">
            <b className="camp-date-num num">{startDay}</b>
            <span className="camp-date-month">{startMonth}</span>
          </div>
        </div>
        <div className="camp-hd-meta">
          <div className="tags">
            <span className={`chip ${camp.registration_open ? 'ok' : 'info'}`}>
              {camp.registration_open ? 'Anmeldung geöffnet' : 'Anmeldung geschlossen'}
            </span>
          </div>
          <div className="cap">
            <div className={`bar${camp.is_full ? ' full' : ''}`}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className={`t num${tight ? ' tight' : ''}`}>
              {tight ? `Nur noch ${camp.spots_remaining} Plätze frei` : `${camp.spots_remaining} von ${camp.capacity} Plätzen frei`}
            </span>
          </div>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: 24 }}>
        <dl className="facts">
          {camp.location && (
            <div className="r">
              <dt>Ort</dt>
              <dd>{camp.location}</dd>
            </div>
          )}
          <div className="r">
            <dt>Zeitraum</dt>
            <dd>{formatCampDateRange(camp.start_date, camp.end_date)}</dd>
          </div>
          <div className="r">
            <dt>Jahrgänge</dt>
            <dd className="num">{camp.age_min} bis {camp.age_max} Jahre</dd>
          </div>
          {camp.care_info && (
            <div className="r">
              <dt>Betreuung</dt>
              <dd>{camp.care_info}</dd>
            </div>
          )}
          {camp.meals_info && (
            <div className="r">
              <dt>Verpflegung</dt>
              <dd>{camp.meals_info}</dd>
            </div>
          )}
        </dl>
      </div>

      {camp.includes && camp.includes.length > 0 && (
        <div className="pad" style={{ paddingBottom: 28 }}>
          <span className="sec-label">Im Preis enthalten</span>
          <ul className="camp-incl">
            {camp.includes.map((item, i) => (
              <li key={i} data-rise>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="dock">
        <div className="line">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="sum num">{formatPrice(camp.price_cents, camp.currency)}</span>
            <span className="muted" style={{ fontSize: 12 }}>pro Kind</span>
          </div>
          <button
            className="btn primary btn-pill"
            type="button"
            onClick={onRegister}
            disabled={!camp.registration_open}
            style={{ width: 'auto', flexGrow: 1, maxWidth: 250 }}
          >
            Jetzt anmelden
          </button>
        </div>
      </div>
    </section>
  )
}

function WaitScreen({
  org,
  camp,
  alternatives,
  onBack,
  onJoinWaitlist,
  onSelectAlternative,
}: {
  org: OrganizationPublic
  camp: CampPublic
  alternatives: CampPublic[]
  onBack: () => void
  onJoinWaitlist: () => void
  onSelectAlternative: (camp: CampPublic) => void
}) {
  const containerRef = useRef<HTMLElement>(null)
  useParentFlowMotion(org.theme, containerRef)

  return (
    <section className="screen" id="s-wait" ref={containerRef}>
      <div className="top">
        <button className="back" type="button" onClick={onBack} aria-label="Zurück zur Übersicht">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="who">
          <b>{org.name}</b>
          <span>{camp.title}</span>
        </div>
      </div>
      <div className="pad sec" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="chip info" style={{ alignSelf: 'flex-start' }}>
          Ausgebucht
        </span>
        <h1 className="d1" data-split style={{ fontSize: 'clamp(27px,6vw,44px)' }}>
          Alle {camp.capacity} Plätze sind vergeben
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '42ch' }}>
          Sie können Ihr Kind auf die Warteliste setzen. {org.name} meldet sich, sobald ein Platz frei wird, und Sie entscheiden dann in Ruhe.
        </p>
        <div className="cap">
          <div className="bar full">
            <i style={{ width: '100%' }} />
          </div>
          <span className="t num">
            {camp.capacity} Plätze belegt, {camp.waitlist_count} {camp.waitlist_count === 1 ? 'Kind' : 'Kinder'} auf der Warteliste
          </span>
        </div>
      </div>
      <div className="pad" style={{ paddingBottom: 28 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <h2 className="d3">So läuft die Warteliste</h2>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            Sie geben nur Name, Jahrgang und Kontaktdaten an. Wird ein Platz frei, meldet sich {org.name} direkt bei Ihnen.
          </p>
          <button className="btn primary" type="button" onClick={onJoinWaitlist}>
            Auf die Warteliste setzen
          </button>
        </div>
      </div>
      {alternatives.length > 0 && (
        <div className="pad" style={{ paddingBottom: 30, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="d3">Termine mit freien Plätzen</h2>
          <div className="camps">
            {alternatives.map((c) => (
              <CampRow key={c.slug} camp={c} onSelect={onSelectAlternative} />
            ))}
          </div>
        </div>
      )}
      <PublicFooter orgSlug={org.slug} />
    </section>
  )
}

function PublicFooter({ orgSlug }: { orgSlug: string }) {
  return (
    <footer className="foot">
      <nav>
        {/* Bug, gefunden im MVP-Oberflächenauftrag: zeigte bisher IMMER
         * KSV Baunatals Rechtsdaten, für jeden Verein auf der Plattform
         * (siehe /impressum, /datenschutz — die bleiben für das separate
         * `backend/`-System unverändert). Jetzt pro Verein, siehe
         * app/pilot/[org]/impressum bzw. datenschutz/page.tsx. */}
        <a href={`/pilot/${orgSlug}/impressum`}>Impressum</a>
        <a href={`/pilot/${orgSlug}/datenschutz`}>Datenschutz</a>
        <a href="#agb">Teilnahmebedingungen</a>
      </nav>
      <span className="by">
        <svg width="23" height="16" viewBox="0 0 112 76" aria-hidden="true">
          <rect x="6" y="6" width="100" height="64" rx="10" fill="none" stroke="currentColor" strokeWidth="6" />
          <path d="M56 6V33M56 43V70" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="56" cy="38" r="15" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="56" cy="38" r="4.5" fill="#D4581F" />
        </svg>
        Anmeldung und Verwaltung über CampsPilot
      </span>
    </footer>
  )
}
