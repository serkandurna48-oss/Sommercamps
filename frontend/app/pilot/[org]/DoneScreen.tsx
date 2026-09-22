'use client'

import { useRef, useState } from 'react'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice } from '../../lib/parentFlowFormat'
import { useParentFlowMotion } from './motion'

/**
 * Bestätigungsscreen — Ticket §6.4. Zeigt zwei Zustände, je nach
 * `result.status`: "registered" (Zahlungsaufforderung, wie in der
 * Referenz) oder "waitlist" (keine Zahlungsaufforderung, andere
 * Bestätigung — §6.5: "Bestätigungstext anders"). Die Referenz bildet nur
 * den registered-Fall ab; der waitlist-Fall ist aus §6.4/§6.5 abgeleitet,
 * nicht erfunden.
 */
export default function DoneScreen({
  org,
  camp,
  result,
  childName,
  parentEmail,
  onBackToOrg,
}: {
  org: OrganizationPublic
  camp: CampPublic
  result: RegistrationCreated
  childName: string
  parentEmail: string
  onBackToOrg: () => void
}) {
  const [copied, setCopied] = useState(false)
  const waitlisted = result.status === 'waitlist'
  const payTo = org.legal_name ?? org.name
  const containerRef = useRef<HTMLElement>(null)
  useParentFlowMotion(org.theme, containerRef)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.payment_reference)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Zwischenablage ohne Berechtigung — kein Fehlerzustand nötig, der Wert steht ohnehin sichtbar da.
    }
  }

  return (
    <section className="screen" id="s-done" ref={containerRef}>
      <header className="ok-band">
        <div className="ok-mark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <h1 className="d1" style={{ fontSize: 'clamp(27px,6vw,42px)', color: 'var(--on-band)' }}>
          {waitlisted ? `${childName} ist auf der Warteliste` : `${childName} ist angemeldet`}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--on-band-2)', maxWidth: '40ch' }}>
          {waitlisted
            ? `Sobald ein Platz beim ${camp.title} frei wird, melden wir uns bei ${parentEmail}. Es entstehen noch keine Kosten.`
            : `Der Platz beim ${camp.title} vom ${formatCampDateRange(camp.start_date, camp.end_date)} ist reserviert.`}
        </p>
      </header>

      <div className="assure" style={{ gap: 8 }}>
        <span className="chip ok">{waitlisted ? 'Auf der Warteliste' : 'Platz reserviert'}</span>
        {!waitlisted && <span className="chip pending">Zahlung offen</span>}
      </div>

      {!waitlisted && (
        <div className="pad sec">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <h2 className="d3">Jetzt überweisen</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="num" style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 'var(--dw)' as never, letterSpacing: 'var(--dtrack)' }}>
                {formatPrice(camp.price_cents, camp.currency)}
              </span>
            </div>
            <dl className="pay">
              <div className="r">
                <dt>Empfänger</dt>
                <dd>{payTo}</dd>
              </div>
              <div className="r">
                <dt>IBAN</dt>
                <dd className="num">{org.iban ?? 'Folgt in der Bestätigungs-E-Mail'}</dd>
              </div>
              <div className="r">
                <dt>Verwendungszweck</dt>
                <dd className="num" style={{ fontWeight: 600 }}>
                  {result.payment_reference}
                </dd>
                <button className="copy" type="button" onClick={handleCopy} aria-label="Verwendungszweck kopieren">
                  {copied ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
                    </svg>
                  )}
                </button>
              </div>
            </dl>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              Der Verwendungszweck ordnet die Zahlung automatisch Ihrem Kind zu. Ohne ihn dauert die Zuordnung länger.
            </p>
          </div>
        </div>
      )}

      <div className="pad" style={{ paddingBottom: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 className="d3">Was als Nächstes passiert</h2>
        <ol className="steps">
          <li data-rise>
            <div className="col">
              <span className="dot did">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              </span>
              <span className="rail" />
            </div>
            <div className="txt">
              <b>Anmeldung gespeichert</b>
              <span>Notieren Sie sich diese Seite — im Pilotbetrieb geht noch keine Bestätigungs-E-Mail raus.</span>
            </div>
          </li>
          {waitlisted ? (
            <>
              <li data-rise>
                <div className="col">
                  <span className="dot now">2</span>
                  <span className="rail" />
                </div>
                <div className="txt">
                  <b>Wir melden uns, sobald ein Platz frei wird</b>
                  <span>Sie haben dann 48 Stunden Zeit zuzusagen.</span>
                </div>
              </li>
              <li data-rise>
                <div className="col">
                  <span className="dot next">3</span>
                </div>
                <div className="txt">
                  <b>Erst nach Ihrer Zusage entstehen Kosten</b>
                  <span>Vorher passiert nichts weiter.</span>
                </div>
              </li>
            </>
          ) : (
            <>
              <li data-rise>
                <div className="col">
                  <span className="dot now">2</span>
                  <span className="rail" />
                </div>
                <div className="txt">
                  <b>Sie überweisen den Betrag</b>
                  <span>Danach geht der Platz an die Warteliste.</span>
                </div>
              </li>
              <li data-rise>
                <div className="col">
                  <span className="dot next">3</span>
                  <span className="rail" />
                </div>
                <div className="txt">
                  <b>Infopaket vor dem Camp</b>
                  <span>Gruppe, Tagesablauf, Treffpunkt und Packliste.</span>
                </div>
              </li>
              <li data-rise>
                <div className="col">
                  <span className="dot next">4</span>
                </div>
                <div className="txt">
                  <b>Erster Camptag</b>
                  <span>{formatCampDateRange(camp.start_date, camp.end_date)}.</span>
                </div>
              </li>
            </>
          )}
        </ol>
        <button className="btn" type="button" onClick={onBackToOrg} style={{ marginTop: 6 }}>
          Weitere Camps ansehen
        </button>
      </div>
    </section>
  )
}
