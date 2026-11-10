'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchBookingStatus, requestBookingCancellation, type BookingStatus } from '../../../../lib/saasApi'
import { formatCampDateRange, formatPrice } from '../../../../lib/parentFlowFormat'

type Contact = { name: string; contact_email: string; contact_phone?: string | null }
type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; data: BookingStatus }
  | { kind: 'not_found' | 'rate_limited' | 'error' }

const STATUS_LABEL: Record<BookingStatus['status'], string> = {
  registered: 'Angemeldet',
  waitlist: 'Warteliste',
  cancelled: 'Storniert',
}

const PAYMENT_LABEL: Record<string, string> = {
  open: 'Zahlung offen',
  paid: 'Bezahlt',
  refunded: 'Erstattet',
  partially_refunded: 'Teilweise erstattet',
  waived: 'Kostenfrei',
  cancelled: 'Keine Zahlung fällig',
}

function whenText(data: BookingStatus): string {
  if (!data.starts_at) return formatCampDateRange(data.start_date, data.end_date)
  return new Date(data.starts_at).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' Uhr'
}

function ContactLine({ org }: { org: Contact }) {
  return (
    <p>
      Bei Fragen erreichen Sie {org.name} unter <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
      {org.contact_phone ? <> oder <a href={`tel:${org.contact_phone.replace(/[^+\d]/g, '')}`}>{org.contact_phone}</a></> : null}.
    </p>
  )
}

/** "Meine Buchung": status of one booking and a cancellation request (the club cancels itself). */
export default function BookingView({ orgSlug, token, org }: { orgSlug: string; token: string; org: Contact }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true
    void fetchBookingStatus(orgSlug, token).then(result => { if (current) setLoad(result) })
    return () => { current = false }
  }, [orgSlug, token])

  useEffect(() => { if (confirming) confirmRef.current?.focus() }, [confirming])

  async function sendRequest() {
    if (sending) return
    setSending(true)
    setError(null)
    const result = await requestBookingCancellation(orgSlug, token)
    setSending(false)
    if (result.kind === 'ok') {
      setRequestedAt(result.cancellationRequestedAt || new Date().toISOString())
      setConfirming(false)
    } else if (result.kind === 'already_cancelled') {
      setCancelled(true)
      setConfirming(false)
    } else {
      setError(
        result.kind === 'rate_limited'
          ? 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
          : 'Die Anfrage ist gerade nicht möglich. Bitte versuchen Sie es später erneut oder wenden Sie sich direkt an den Verein.',
      )
    }
  }

  if (load.kind === 'loading') {
    return <p role="status" aria-live="polite">Ihre Anmeldung wird geladen …</p>
  }
  if (load.kind === 'not_found') {
    return (
      <div role="status">
        <h1 className="legal-h1">Anmeldung nicht gefunden</h1>
        <p>Diese Anmeldung konnten wir nicht finden. Bitte öffnen Sie den Link aus Ihrer Bestätigungsmail erneut.</p>
        <ContactLine org={org} />
      </div>
    )
  }
  if (load.kind !== 'ok') {
    return (
      <div role="alert">
        <h1 className="legal-h1">Gerade nicht erreichbar</h1>
        <p>
          {load.kind === 'rate_limited'
            ? 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
            : 'Ihre Anmeldung konnte nicht geladen werden. Bitte versuchen Sie es später erneut.'}
        </p>
        <ContactLine org={org} />
      </div>
    )
  }

  const data = load.data
  const isCancelled = cancelled || data.status === 'cancelled'
  const requested = requestedAt ?? data.cancellation_requested_at
  const showPayment = !isCancelled && data.status !== 'waitlist'

  return (
    <div className="legal-body">
      <span className="legal-label">Meine Buchung</span>
      <h1 className="legal-h1">Ihre Anmeldung</h1>

      <section aria-labelledby="booking-details">
        <h2 id="booking-details">Angaben zur Buchung</h2>
        <dl>
          <div><dt>{data.starts_at ? 'Training' : 'Camp'}</dt><dd>{data.camp_title}</dd></div>
          <div><dt>Zeitraum</dt><dd>{whenText(data)}</dd></div>
          <div><dt>Kind</dt><dd>{data.child_first_name}</dd></div>
          <div><dt>Status</dt><dd>{isCancelled ? STATUS_LABEL.cancelled : STATUS_LABEL[data.status]}</dd></div>
          {showPayment && (
            <>
              <div><dt>Zahlung</dt><dd>{PAYMENT_LABEL[data.payment_status] ?? data.payment_status}</dd></div>
              <div><dt>Betrag</dt><dd>{formatPrice(data.amount_cents, data.currency)}</dd></div>
            </>
          )}
        </dl>
        {data.status === 'waitlist' && !isCancelled && (
          <p>Ihr Kind steht auf der Warteliste. Es entstehen noch keine Kosten. {org.name} meldet sich, sobald ein Platz frei wird.</p>
        )}
        {data.invoice_available && (
          <p>Ihre Rechnung wurde Ihnen per E-Mail geschickt. Falls sie fehlt, wenden Sie sich bitte an den Verein.</p>
        )}
      </section>

      {!isCancelled && (
        <section aria-labelledby="booking-cancel">
          <h2 id="booking-cancel">Stornierung</h2>
          {requested ? (
            <p role="status">
              <strong>Stornierung angefragt.</strong> Wir haben Ihre Anfrage an den Verein weitergegeben.
              Der Verein meldet sich bei Ihnen.
            </p>
          ) : confirming ? (
            <div ref={confirmRef} tabIndex={-1} role="group" aria-label="Stornierung bestätigen">
              <p>Möchten Sie die Stornierung wirklich anfragen? Storniert wird die Anmeldung erst, wenn der Verein sie bestätigt.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                <button className="btn primary btn-pill" type="button" disabled={sending} aria-busy={sending} onClick={sendRequest}>
                  Ja, Stornierung anfragen
                </button>
                <button className="btn btn-pill" type="button" disabled={sending} onClick={() => { setConfirming(false); setError(null) }}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <>
              <p>Sie können nicht mehr teilnehmen? Dann fragen Sie hier die Stornierung an.</p>
              <button className="btn btn-pill" type="button" style={{ marginTop: 12 }} onClick={() => setConfirming(true)}>
                Stornierung anfragen
              </button>
            </>
          )}
          {error && <p role="alert" style={{ marginTop: 12 }}>{error}</p>}
        </section>
      )}

      {isCancelled && <p>Diese Anmeldung ist storniert.</p>}
      <ContactLine org={org} />
    </div>
  )
}
