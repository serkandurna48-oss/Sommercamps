'use client'

import { useEffect, useRef } from 'react'
import type { OrganizationPublic, RegistrationCreated, TrainingOfferPublic, TrainingPaymentMethod, TrainingSessionPublic } from '../../../lib/saasApi'
import { bookingPriceText, formatSessionDateTime } from '../../../lib/trainingFormat'
import TransferDetails from '../TransferDetails'

/**
 * Bestätigung einer Trainingsbuchung. Der Preis kommt ausschließlich aus
 * `result.applied_price_cents` (Server), nie aus den Angebotspreisen, und es
 * erscheint kein Hinweis auf eine Mitgliedschaft.
 */
export default function TrainingDoneScreen({
  org, offer, session, result, childName, parentEmail, paymentMethod, onBookAnother,
}: {
  org: OrganizationPublic
  offer: Pick<TrainingOfferPublic, 'title' | 'location'>
  session: Pick<TrainingSessionPublic, 'local_date' | 'local_time'>
  result: RegistrationCreated
  childName: string
  parentEmail: string
  paymentMethod: TrainingPaymentMethod
  onBookAnother: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [])
  const payTo = org.legal_name ?? org.name
  const when = formatSessionDateTime(session.local_date, session.local_time)
  const price = bookingPriceText(result)
  const bandTextColor = org.theme === 'tradition' ? 'var(--brand-on)' : 'var(--on-band)'

  return (
    <section className="screen" id="s-done">
      <header className="ok-band">
        <div className="ok-mark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="d3c-check-path" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <h1 ref={headingRef} tabIndex={-1} role="status" className="d1 done-headline" lang="de" style={{ color: bandTextColor }}>
          Buchung eingegangen
        </h1>
        <p className="done-sub" style={{ color: org.theme === 'tradition' ? bandTextColor : 'var(--on-band-2)' }}>
          {childName} ist gebucht – {offer.title} am {when}.
        </p>
        <p className="done-sub done-email" style={{ color: bandTextColor }}>
          Wir haben eine Bestätigung an {parentEmail} geschickt.
        </p>
      </header>

      <div className="assure" style={{ gap: 8 }}>
        <span className="chip ok">Termin reserviert</span>
        <span className="chip pending">{paymentMethod === 'bar' ? 'Zahlung vor Ort' : 'Zahlung offen'}</span>
      </div>

      <div className="pad" style={{ paddingTop: 28, paddingBottom: 0 }}>
        <div className="done-summary">
          <p className="done-summary-title">Buchungsdetails</p>
          <dl className="done-summary-rows">
            <div className="done-summary-row"><dt>Kind</dt><dd>{childName}</dd></div>
            <div className="done-summary-row"><dt>Training</dt><dd>{offer.title}</dd></div>
            <div className="done-summary-row"><dt>Termin</dt><dd>{when}</dd></div>
            {offer.location && <div className="done-summary-row"><dt>Ort</dt><dd>{offer.location}</dd></div>}
            {price && <div className="done-summary-row"><dt>Preis</dt><dd className="num">{price}</dd></div>}
          </dl>

          {paymentMethod === 'ueberweisung' && org.iban && (
            <TransferDetails payTo={payTo} iban={org.iban} amountText={price} paymentReference={result.payment_reference} />
          )}
          {paymentMethod === 'ueberweisung' && !org.iban && (
            <div className="note quiet">
              <p>Der Verein meldet sich zur Zahlung. Ihre Referenz: <strong>{result.payment_reference}</strong>.</p>
            </div>
          )}
          {paymentMethod === 'bar' && (
            <div className="note quiet"><p>Bitte bar beim Training bezahlen.</p></div>
          )}
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: 30, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 28 }}>
        <h2 className="d3">Was als Nächstes passiert</h2>
        <p>Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.</p>
        {(org.contact_person_name || org.contact_email || org.contact_phone) && (
          <div className="done-contact">
            <h2 className="d3">Kontakt zum Verein</h2>
            <p>{org.contact_person_name || org.name}</p>
            {org.contact_email && <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>}
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^+\d]/g, '')}`}>{org.contact_phone}</a>}
          </div>
        )}
        <button className="btn btn-pill" type="button" onClick={() => window.print()}>Seite drucken</button>
        <button className="btn primary btn-pill" type="button" onClick={onBookAnother}>Weiteren Termin buchen</button>
      </div>
    </section>
  )
}
