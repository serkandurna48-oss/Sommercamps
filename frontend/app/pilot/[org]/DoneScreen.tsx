'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [copiedField, setCopiedField] = useState<'ref' | 'iban' | 'betrag' | null>(null)
  const waitlisted = result.status === 'waitlist'
  const payTo = org.legal_name ?? org.name
  // Only show transfer instructions when the organization has supplied an IBAN.
  const iban = org.iban
  const priceText = formatPrice(camp.price_cents, camp.currency)
  const containerRef = useRef<HTMLElement>(null)
  useParentFlowMotion(org.theme, containerRef)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [])

  async function handleCopy(field: 'ref' | 'iban' | 'betrag', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1600)
    } catch {
      // Zwischenablage ohne Berechtigung — kein Fehlerzustand nötig, der Wert steht ohnehin sichtbar da.
    }
  }

  return (
    <section className="screen" id="s-done" ref={containerRef}>
      <header className="ok-band">
        <div className="ok-mark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="d3c-check-path" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          role="status"
          className="d1 done-headline"
          lang="de"
          style={{ color: 'var(--on-band)' }}
        >
          {waitlisted ? `${childName} ist auf der Warteliste` : 'Anmeldung eingegangen'}
        </h1>
        <p className="done-sub" style={{ color: 'var(--on-band-2)' }}>
          {waitlisted
            ? `${payTo} meldet sich bei Ihnen — unter ${parentEmail} oder telefonisch —, sobald beim ${camp.title} ein Platz frei wird. Es entstehen noch keine Kosten.`
            : `${childName} ist angemeldet — der Platz beim ${camp.title} vom ${formatCampDateRange(camp.start_date, camp.end_date)} ist reserviert.`}
        </p>
      </header>

      <div className="assure" style={{ gap: 8 }}>
        <span className="chip ok">{waitlisted ? 'Auf der Warteliste' : 'Platz reserviert'}</span>
        {!waitlisted && <span className="chip pending">Zahlung offen</span>}
      </div>

      <div className="pad" style={{ paddingTop: 28, paddingBottom: 0 }}>
        <div className="done-summary">
          <p className="done-summary-title">Buchungsdetails</p>
          <dl className="done-summary-rows">
            <div className="done-summary-row">
              <dt>Kind</dt>
              <dd>{childName}</dd>
            </div>
            <div className="done-summary-row">
              <dt>Camp</dt>
              <dd>{camp.title}</dd>
            </div>
            <div className="done-summary-row">
              <dt>Zeitraum</dt>
              <dd>{formatCampDateRange(camp.start_date, camp.end_date)}</dd>
            </div>
            <div className="done-summary-row">
              <dt>Preis</dt>
              <dd className="num">{formatPrice(camp.price_cents, camp.currency)}</dd>
            </div>
          </dl>

          {!waitlisted && iban && (
            <div className="done-transfer">
              <span className="done-transfer-label">Überweisung</span>
              <dl className="done-transfer-rows">
                <div className="done-transfer-row">
                  <dt>Empfänger</dt>
                  <dd>{payTo}</dd>
                </div>
                {iban && (
                  <div className="done-transfer-row has-copy">
                    <dt>IBAN</dt>
                    <dd className="num">{iban}</dd>
                    <button className="copy" type="button" onClick={() => handleCopy('iban', iban)} aria-label="IBAN kopieren">
                      {copiedField === 'iban' ? (
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
                )}
                {iban && (
                  <div className="done-transfer-row has-copy">
                    <dt>Betrag</dt>
                    <dd className="num">{priceText}</dd>
                    <button className="copy" type="button" onClick={() => handleCopy('betrag', priceText)} aria-label="Betrag kopieren">
                      {copiedField === 'betrag' ? (
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
                )}
              </dl>
              <div style={{ marginTop: 8 }}>
                <span className="done-transfer-label" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Verwendungszweck</span>
                <div className="done-ref-wrap">
                  <span className="done-ref num">{result.payment_reference}</span>
                  <button className="copy" type="button" onClick={() => handleCopy('ref', result.payment_reference)} aria-label="Verwendungszweck kopieren">
                    {copiedField === 'ref' ? (
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
                <p className="done-ref-note" style={{ marginTop: 8 }}>
                  {iban
                    ? `Bitte den Verwendungszweck mit angeben — damit ordnet ${payTo} die Zahlung Ihrem Kind zu.`
                    : `${payTo} sendet Ihnen die Zahlungsdetails direkt. Bei Fragen: ${org.contact_email}${org.contact_phone ? ` oder ${org.contact_phone}` : ''}.`}
                </p>
              </div>
            </div>
          )}
          {!waitlisted && !iban && (
            <div className="note quiet">
              <p>Der Verein meldet sich zur Zahlung. Ihre Referenz: <strong>{result.payment_reference}</strong>.</p>
            </div>
          )}
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: 30, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 28 }}>
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
              <b>{waitlisted ? 'Auf der Warteliste eingetragen' : 'Anmeldung gespeichert'}</b>
              <span>Wir schicken Ihnen eine Bestätigung an {parentEmail}. Bitte sehen Sie auch im Spam-Ordner nach.</span>
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
                  <b>{payTo} meldet sich, sobald ein Platz frei wird</b>
                </div>
              </li>
              <li data-rise>
                <div className="col">
                  <span className="dot next">3</span>
                </div>
                <div className="txt">
                  <b>Der Verein informiert Sie über das Nachrücken</b>
                  <span>Der Verein informiert Sie persönlich — keine automatische Nachricht, keine Frist.</span>
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
                  <b>{iban ? 'Sie überweisen den Betrag' : 'Der Verein meldet sich zur Zahlung'}</b>
                  <span>{iban ? `${payTo} vermerkt den Zahlungseingang von Hand — das kann einige Tage dauern.` : `${payTo} sendet Ihnen die Zahlungsdetails direkt.`}</span>
                </div>
              </li>
              <li data-rise>
                <div className="col">
                  <span className="dot next">3</span>
                  <span className="rail" />
                </div>
                <div className="txt">
                  <b>Infos vor dem Camp</b>
                  <span>Gruppe, Tagesablauf, Treffpunkt und Packliste erfahren Sie direkt von {payTo}.</span>
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
        <div className="done-contact">
          <h2 className="d3">Kontakt zum Verein</h2>
          <p>{org.contact_person_name || org.name}</p>
          <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
          {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^+\d]/g, '')}`}>{org.contact_phone}</a>}
        </div>
        <button className="btn btn-pill" type="button" onClick={onBackToOrg} style={{ marginTop: 6 }}>
          Zurück zur Übersicht
        </button>
      </div>
    </section>
  )
}
