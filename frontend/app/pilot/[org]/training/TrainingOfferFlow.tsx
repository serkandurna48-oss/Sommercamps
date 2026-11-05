'use client'

import { useCallback, useEffect, useState } from 'react'
import type { OrganizationPublic, RegistrationCreated, TrainingOfferDetail, TrainingPaymentMethod, TrainingSessionPublic } from '../../../lib/saasApi'
import { fetchTrainingOffer } from '../../../lib/saasApi'
import {
  findBookableSession, formatSessionDateTime, memberPriceText, sessionAsCamp, sessionAvailability,
} from '../../../lib/trainingFormat'
import RegistrationFormScreen from '../RegistrationFormScreen'
import TrainingDoneScreen from './TrainingDoneScreen'
import './trainingPages.css'

type Screen = 'detail' | 'form' | 'done'

interface DoneState {
  result: RegistrationCreated
  childName: string
  parentEmail: string
  paymentMethod: TrainingPaymentMethod
  session: TrainingSessionPublic
}

const SLOT_TAKEN_NOTICE = {
  full: 'Dieser Termin wurde gerade vergeben. Bitte wählen Sie einen anderen Termin.',
  past: 'Dieser Termin ist nicht mehr buchbar. Bitte wählen Sie einen anderen Termin.',
} as const

/** Angebot, Terminauswahl, Buchungsformular und Bestätigung auf einer Route. */
export default function TrainingOfferFlow({ org, initialOffer }: { org: OrganizationPublic; initialOffer: TrainingOfferDetail }) {
  const [offer, setOffer] = useState(initialOffer)
  const [screen, setScreen] = useState<Screen>('detail')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { window.scrollTo?.(0, 0) }, [screen])

  const reload = useCallback(async (bookedSlug?: string) => {
    try {
      const fresh = await fetchTrainingOffer(org.slug, offer.slug)
      if (fresh) { setOffer(fresh); return }
    } catch { /* fall through to the local fallback */ }
    // Reload failed or offer vanished: at least hide the slot that was just refused.
    if (bookedSlug) {
      setOffer(current => ({
        ...current,
        sessions: current.sessions.map(item => item.slug === bookedSlug ? { ...item, free_spots: 0 } : item),
      }))
    }
  }, [org.slug, offer.slug])

  const selected = findBookableSession(offer.sessions, selectedSlug)

  if (screen === 'form' && selected) {
    return (
      <RegistrationFormScreen
        orgSlug={org.slug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        contactEmail={org.contact_email}
        hasBankDetails={Boolean(org.iban)}
        camp={sessionAsCamp(offer, selected)}
        questions={org.registration_questions ?? []}
        training={{
          dateTimeLabel: formatSessionDateTime(selected.local_date, selected.local_time),
          priceText: memberPriceText(selected.price_member_cents, selected.price_nonmember_cents),
          onSlotTaken: (conflict) => {
            setNotice(SLOT_TAKEN_NOTICE[conflict])
            setScreen('detail')
            setSelectedSlug(null)
            void reload(selected.slug)
          },
        }}
        onBack={() => setScreen('detail')}
        onSubmitted={(result, childName, parentEmail, _details, paymentMethod) => {
          setDone({ result, childName, parentEmail, paymentMethod: paymentMethod ?? 'ueberweisung', session: selected })
          setScreen('done')
        }}
      />
    )
  }

  if (screen === 'done' && done) {
    return (
      <TrainingDoneScreen
        org={org} offer={offer} session={done.session} result={done.result}
        childName={done.childName} parentEmail={done.parentEmail} paymentMethod={done.paymentMethod}
        onBookAnother={() => {
          setDone(null)
          setSelectedSlug(null)
          setNotice(null)
          setScreen('detail')
          void reload()
        }}
      />
    )
  }

  return (
    <div className="tr-col">
      <a className="back-link" href={`/pilot/${org.slug}/training`}>Alle Angebote</a>
      <h1 className="d1" lang="de" style={{ marginTop: 12 }}>{offer.title}</h1>
      {offer.description && <p className="tr-lead" style={{ whiteSpace: 'pre-line' }}>{offer.description}</p>}
      <dl className="facts tr-facts">
        <div className="r"><dt>Dauer</dt><dd>{offer.duration_minutes} Minuten</dd></div>
        {offer.location && <div className="r"><dt>Ort</dt><dd>{offer.location}</dd></div>}
        <div className="r"><dt>Preis</dt><dd>{memberPriceText(offer.price_member_cents, offer.price_nonmember_cents)}</dd></div>
      </dl>
      <p className="note quiet tr-notice">Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.</p>

      {notice && <div className="note tr-notice" role="status">{notice}</div>}

      <h2 className="d3" style={{ marginTop: 28 }}>Termin wählen</h2>
      {offer.sessions.length === 0 ? (
        <p className="tr-lead">Aktuell sind keine Termine buchbar. Bitte melden Sie sich beim Verein{org.contact_email ? <>: <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a></> : '.'}</p>
      ) : (
        <ul className="tr-sessions">
          {offer.sessions.map(item => {
            const availability = sessionAvailability(item)
            const when = formatSessionDateTime(item.local_date, item.local_time)
            return (
              <li key={item.slug}>
                {availability.bookable ? (
                  <button type="button" className="tr-session" onClick={() => { setSelectedSlug(item.slug); setNotice(null); setScreen('form') }}>
                    <span className="tr-session-when">{when}</span>
                    <span className="tr-session-spots">{availability.label}</span>
                  </button>
                ) : (
                  <div className="tr-session full" aria-disabled="true">
                    <span className="tr-session-when">{when}</span>
                    <span className="tr-session-spots">{availability.label}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
