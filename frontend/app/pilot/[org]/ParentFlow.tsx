'use client'

import Image from 'next/image'
import { useMemo, useRef, useState } from 'react'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice, orgShortCode } from '../../lib/parentFlowFormat'
import CampRow from './CampRow'
import RegistrationFormScreen from './RegistrationFormScreen'
import DoneScreen from './DoneScreen'
import { useParentFlowMotion } from './motion'

type ScreenName = 'org' | 'camp' | 'form' | 'done' | 'wait'

interface DoneState {
  result: RegistrationCreated
  childName: string
  parentEmail: string
}

const HERO_IMAGE: Record<string, { src: string; alt: string }> = {
  tradition: { src: '/pilot/leibchen.webp', alt: 'Gefaltete Trainingsleibchen auf einer Bank am Spielfeldrand.' },
  akademie: { src: '/pilot/hero.webp', alt: 'Der Sportplatz bei Flutlicht.' },
}

export default function ParentFlow({ org, camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
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
    setScreen('org')
    setSelectedSlug(null)
    setDone(null)
    window.scrollTo(0, 0)
  }

  if (screen === 'form' && selectedCamp) {
    return (
      <RegistrationFormScreen
        orgSlug={org.slug}
        orgName={org.name}
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

  const hero = HERO_IMAGE[org.theme]

  return (
    <section className="screen" id="s-org" ref={orgContainerRef}>
      {org.theme === 'tradition' && (
        <header className="hero h-trad">
          <div className="shield">{shortCode}</div>
          <h1 className="d1" data-split>{org.name}</h1>
          <div className="rule" />
          <p className="intro" data-rise>Alle Camps auf einen Blick — wählen Sie unten den passenden Termin für Ihr Kind.</p>
          {hero && (
            <div className="shot">
              <Image id="shotA" src={hero.src} alt={hero.alt} width={1040} height={680} priority style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
        </header>
      )}

      {org.theme === 'akademie' && (
        <header className="hero h-akad">
          <div className="bg">{hero && <Image id="shotB" src={hero.src} alt={hero.alt} fill priority style={{ objectFit: 'cover', opacity: 0.46 }} />}</div>
          <div className="veil" />
          <div className="in">
            <span className="mark">
              <span className="c">{shortCode}</span>
              <span className="t">{org.name}</span>
            </span>
            <h1 className="d1" data-split>{org.name}</h1>
            <p className="intro" data-rise style={{ fontSize: 16, lineHeight: 1.6, color: '#C6CFCB', maxWidth: '40ch' }}>
              Alle Camps auf einen Blick — wählen Sie unten den passenden Termin für Ihr Kind.
            </p>
          </div>
        </header>
      )}

      {org.theme === 'kompakt' && (
        <header className="hero h-komp">
          <div className="in">
            <div className="side">
              <span className="sq">{shortCode}</span>
              <span className="lab">Feriencamps</span>
            </div>
            <div>
              <h1 className="d1" data-split>{org.name}</h1>
              <p className="intro" data-rise>Alle Camps auf einen Blick — wählen Sie unten den passenden Termin für Ihr Kind.</p>
              <div className="facts">
                <div data-rise>
                  <b className="num" data-count={camps.length}>{camps.length}</b>
                  <span>{camps.length === 1 ? 'Camp' : 'Camps'}</span>
                </div>
                <div data-rise>
                  <b className="num" data-count={camps.reduce((sum, c) => sum + c.capacity, 0)}>
                    {camps.reduce((sum, c) => sum + c.capacity, 0)}
                  </b>
                  <span>Plätze</span>
                </div>
                <div data-rise>
                  <b className="num" data-count={4}>4</b>
                  <span>Minuten Anmeldung</span>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="assure">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.55 }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>Die Anmeldung dauert etwa vier Minuten. Sie brauchen kein Benutzerkonto.</span>
      </div>

      <div className="pad sec">
        <div className="sec-head">
          <h2 className="d2" data-split>Camps{campsByYear ? ` ${campsByYear}` : ''}</h2>
          <span className="lab num">{camps.length} {camps.length === 1 ? 'Termin' : 'Termine'}</span>
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

function CampScreen({
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

  return (
    <section className="screen" id="s-camp" ref={containerRef}>
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

      <div className="pad sec" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 28 }}>
        <div className="tags">
          <span className={`chip ${camp.registration_open ? 'ok' : 'info'}`}>{camp.registration_open ? 'Anmeldung geöffnet' : 'Anmeldung geschlossen'}</span>
          <span className="tag">
            {camp.age_min} bis {camp.age_max} Jahre
          </span>
        </div>
        <h1 className="d1" data-split style={{ fontSize: 'clamp(28px,6.4vw,46px)' }}>
          {camp.title}
        </h1>
        <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>
          {formatCampDateRange(camp.start_date, camp.end_date)}
        </span>
        <div className="cap">
          <div className={`bar${camp.is_full ? ' full' : ''}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className={`t num${tight ? ' tight' : ''}`}>
            {tight ? `Nur noch ${camp.spots_remaining} Plätze frei` : `${camp.spots_remaining} von ${camp.capacity} Plätzen frei`}
          </span>
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
            <dt>Jahrgänge</dt>
            <dd className="num">
              {camp.age_min} bis {camp.age_max} Jahre
            </dd>
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
        <div className="pad" style={{ paddingBottom: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="d3">Im Preis enthalten</h2>
          <ul className="list-check">
            {camp.includes.map((item, i) => (
              <li key={i} data-rise>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dock">
        <div className="line">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="sum num">{formatPrice(camp.price_cents, camp.currency)}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              pro Kind
            </span>
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={onRegister}
            disabled={!camp.registration_open}
            style={{ width: 'auto', flexGrow: 1, maxWidth: 250 }}
          >
            Kind anmelden
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
          Sie können Ihr Kind auf die Warteliste setzen. Wir melden uns, sobald ein Platz frei wird, und Sie entscheiden dann in Ruhe.
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
            Sie geben nur Name, Jahrgang und Kontaktdaten an. Wird ein Platz frei, benachrichtigen wir der Reihe nach — Sie haben 48 Stunden Zeit zuzusagen.
            Erst nach Ihrer Zusage entstehen Kosten.
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
