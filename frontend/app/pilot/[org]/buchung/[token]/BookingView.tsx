'use client'

import { useEffect, useRef, useState } from 'react'
import { cancelBookingAsParent, fetchBookingStatus, type BookingStatus } from '../../../../lib/saasApi'
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

function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

function ContactInline({ org, lead = 'Bitte wenden Sie sich an' }: { org: Contact; lead?: string }) {
  return (
    <>
      {lead} {org.name}: <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
      {org.contact_phone ? <> oder <a href={`tel:${org.contact_phone.replace(/[^+\d]/g, '')}`}>{org.contact_phone}</a></> : null}.
    </>
  )
}

/** Why the parents cannot cancel themselves (Sie-Form), always with the club contact. */
function NoSelfCancel({ data, org }: { data: BookingStatus; org: Contact }) {
  const { self_cancel: sc } = data
  const start = data.starts_at ? 'Trainingsbeginn' : 'Campbeginn'
  let reason: string
  let lead: string | undefined
  if (sc.reason === 'deadline_passed' && sc.deadline) {
    reason = `Eine Stornierung ist bis ${sc.days} Tage vor ${start} (bis zum ${formatDay(sc.deadline)}) möglich.`
  } else if (sc.reason === 'payment_pending') {
    reason = 'Die Zahlung ist noch nicht abgeschlossen.'
    lead = 'Zum Stornieren wenden Sie sich bitte an'
  } else if (data.payment_status === 'partially_refunded' || data.payment_status === 'refunded') {
    reason = 'Diese Anmeldung kann nur der Verein stornieren.'
  } else {
    reason = 'Bei Überweisung oder Barzahlung storniert der Verein Ihre Anmeldung.'
  }
  return <p>{reason} <ContactInline org={org} lead={lead} /></p>
}

/** "Meine Buchung": status of one booking; parents cancel themselves when they paid online in time. */
export default function BookingView({ orgSlug, token, org }: { orgSlug: string; token: string; org: Contact }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ refundCents: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let current = true
    void fetchBookingStatus(orgSlug, token).then(result => { if (current) setLoad(result) })
    return () => { current = false }
  }, [orgSlug, token])

  useEffect(() => { if (confirming) confirmRef.current?.focus() }, [confirming])

  async function cancelNow(refundCents: number | null) {
    if (inFlight.current) return // the state below is too slow for a double click
    inFlight.current = true
    setSending(true)
    setError(null)
    const result = await cancelBookingAsParent(orgSlug, token)
    inFlight.current = false
    setSending(false)
    if (result.kind === 'ok') {
      setLoad({ kind: 'ok', data: result.data })
      setDone({ refundCents })
      setConfirming(false)
    } else if (result.kind === 'not_allowed' || result.kind === 'refund_failed') {
      setError(result.message || 'Die Stornierung ist gerade nicht möglich. Bitte wenden Sie sich an den Verein.')
    } else {
      setError(
        result.kind === 'rate_limited'
          ? 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
          : 'Die Stornierung ist gerade nicht möglich. Bitte versuchen Sie es später erneut oder wenden Sie sich direkt an den Verein.',
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
  const isCancelled = data.status === 'cancelled'
  const sc = data.self_cancel
  const onWaitlist = sc.reason === 'waitlist'
  const refundCents = sc.refund_cents
  // The cancel section already names the club when it explains why parents cannot cancel or an error occurred.
  const contactShown = (!isCancelled && !sc.possible) || error !== null
  const showPayment = !isCancelled && data.status !== 'waitlist'
  return (
    <div className="legal-body">
      <span className="legal-label">Meine Buchung</span>
      <h1 className="legal-h1">Ihre Anmeldung</h1>

      <section aria-labelledby="booking-details">
        <h2 id="booking-details">Angaben zur Buchung</h2>
        <dl className="booking-facts">
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
          {!sc.possible ? (
            <NoSelfCancel data={data} org={org} />
          ) : confirming ? (
            <div ref={confirmRef} tabIndex={-1} role="group" aria-label="Stornierung bestätigen">
              {onWaitlist ? (
                <p>Möchten Sie Ihr Kind wirklich von der Warteliste abmelden? Es entstehen keine Kosten.</p>
              ) : (
                <p>
                  Möchten Sie die Anmeldung wirklich stornieren?
                  {refundCents != null && <> Sie erhalten {formatPrice(refundCents, data.currency)} zurück auf das Zahlungsmittel, mit dem Sie bezahlt haben.</>}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                <button className="btn primary btn-pill" type="button" disabled={sending} aria-busy={sending} onClick={() => cancelNow(refundCents)}>
                  {onWaitlist ? 'Ja, von der Warteliste abmelden' : 'Ja, Anmeldung stornieren'}
                </button>
                <button className="btn btn-pill" type="button" disabled={sending} onClick={() => { setConfirming(false); setError(null) }}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <>
              {onWaitlist ? (
                <p>Sie möchten nicht mehr warten? Dann können Sie Ihr Kind hier von der Warteliste abmelden.</p>
              ) : (
                <p>
                  Sie können nicht mehr teilnehmen?
                  {sc.deadline && <> Bis zum {formatDay(sc.deadline)} können Sie Ihre Anmeldung hier selbst stornieren.</>}
                  {refundCents != null && <> Sie erhalten {formatPrice(refundCents, data.currency)} zurück.</>}
                </p>
              )}
              <button className="btn btn-pill" type="button" style={{ marginTop: 12 }} onClick={() => setConfirming(true)}>
                {onWaitlist ? 'Von der Warteliste abmelden' : 'Anmeldung stornieren'}
              </button>
            </>
          )}
          {error && (
            <div role="alert" style={{ marginTop: 12 }}>
              <p>{error}</p>
              <p><ContactInline org={org} /></p>
            </div>
          )}
        </section>
      )}

      {isCancelled && done && (
        <p role="status">
          {done.refundCents != null ? (
            <>
              <strong>Ihre Anmeldung ist storniert.</strong> Wir haben {formatPrice(done.refundCents, data.currency)} auf das
              Zahlungsmittel erstattet, mit dem Sie bezahlt haben. Je nach Bank dauert die Gutschrift einige Werktage.
            </>
          ) : (
            <><strong>Sie stehen nicht mehr auf der Warteliste.</strong> Es sind keine Kosten entstanden.</>
          )}
        </p>
      )}
      {isCancelled && !done && <p>Diese Anmeldung ist storniert.</p>}
      {!contactShown && <ContactLine org={org} />}
    </div>
  )
}
