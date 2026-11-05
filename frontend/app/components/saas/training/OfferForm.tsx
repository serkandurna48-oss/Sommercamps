'use client'

import { useActionState, useId, useState, type ReactNode } from 'react'
import { createOfferAction, updateOfferAction, type TrainingFormState } from '../actions/trainingActions'
import { suggestCampSlug } from '../config/campDuplicate'
import Button from '../ui/Button'
import Field from '../ui/Field'
import PriceInput from '../ui/PriceInput'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'
import type { TrainingOffer } from '../../../lib/saasAdminApi'
import {
  OFFER_KINDS,
  OFFER_STATUSES,
  formatEuroInput,
  offerKindLabel,
  offerStatusLabel,
} from './trainingLogic'

const initialState: TrainingFormState = { error: null }

/** Anlegen und Bearbeiten eines Trainingsangebots. Web-Adresse und Art sind
 * nach dem Anlegen unveränderlich (Backend: 422), im Bearbeiten nur Anzeige. */
export default function OfferForm({ orgSlug, offer, brandStrong, brandOn, backButton }: {
  orgSlug: string
  offer?: TrainingOffer
  brandStrong: string
  brandOn: string
  backButton?: ReactNode
}) {
  const feedbackId = useId()
  const editing = Boolean(offer)
  const [title, setTitle] = useState(offer?.title ?? '')
  const [customSlug, setCustomSlug] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Record<string, string>>({})
  const bound = editing ? updateOfferAction.bind(null, orgSlug, offer!.id) : createOfferAction.bind(null, orgSlug)

  const [state, formAction, pending] = useActionState<TrainingFormState, FormData>(async (previous, data) => {
    // React resets uncontrolled fields after an action; keep what was typed.
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    const result = await bound(previous, data)
    if (result.redirectTo) {
      // Full page load, same reason as createCampAction: no stuck pending state after a soft redirect.
      window.location.assign(result.redirectTo)
      return new Promise<TrainingFormState>(() => {})
    }
    return result
  }, initialState)

  const err = (name: string) => (pending ? undefined : state.fieldErrors?.[name])
  const value = (name: string, fallback: string) => submitted[name] ?? fallback

  return (
    <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="flex flex-col gap-4">
      <section className="cp-card flex flex-col gap-4">
        <Field label="Titel" htmlFor="offer_title" error={err('title')}>
          <input id="offer_title" name="title" required value={title} onChange={event => setTitle(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>

        {editing ? (
          <dl className="cp-body grid grid-cols-1 gap-2 sm:grid-cols-2" style={{ color: 'var(--cp-ink-2)' }}>
            <div><dt className="cp-label">Art</dt><dd>{offerKindLabel[offer!.kind]}</dd></div>
            <div><dt className="cp-label">Web-Adresse</dt><dd className="font-mono break-all">{offer!.slug}</dd></div>
          </dl>
        ) : (
          <>
            <Field label="Art" htmlFor="offer_kind" hint="Einzeltraining: ein Kind pro Termin. Gruppentraining: 1 bis 8 Plätze pro Termin. Nach dem Anlegen nicht mehr änderbar." error={err('kind')}>
              <select id="offer_kind" name="kind" required defaultValue={value('kind', 'einzel')} className={INPUT_CLASS} style={INPUT_STYLE}>
                {OFFER_KINDS.map(kind => <option key={kind} value={kind}>{offerKindLabel[kind]}</option>)}
              </select>
            </Field>
            <Field label="Web-Adresse" htmlFor="offer_slug" hint="Aus dem Titel vorgeschlagen: Kleinbuchstaben, Zahlen und Bindestriche. Nach dem Anlegen nicht mehr änderbar." error={err('slug')}>
              <input id="offer_slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={customSlug ?? submitted.slug ?? suggestCampSlug(title)}
                onChange={event => setCustomSlug(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
            </Field>
          </>
        )}

        <Field label="Beschreibung (optional)" htmlFor="offer_description">
          <textarea id="offer_description" name="description" rows={3} defaultValue={value('description', offer?.description ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dauer" htmlFor="offer_duration_minutes" suffix="Minuten" error={err('duration_minutes')}>
            <input id="offer_duration_minutes" name="duration_minutes" type="number" inputMode="numeric" min={1} max={600} required
              defaultValue={value('duration_minutes', String(offer?.duration_minutes ?? 45))} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Ort (optional)" htmlFor="offer_location">
            <input id="offer_location" name="location" defaultValue={value('location', offer?.location ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Preis für Vereinsmitglieder" htmlFor="offer_price_member_euros" suffix="€" hint="Zum Beispiel 30,00. 0 ist erlaubt." error={err('price_member_euros')}>
            <PriceInput id="offer_price_member_euros" name="price_member_euros" required defaultValue={value('price_member_euros', offer ? formatEuroInput(offer.price_member_cents) : '')} />
          </Field>
          <Field label="Preis für Nichtmitglieder" htmlFor="offer_price_nonmember_euros" suffix="€" hint="Zum Beispiel 40,00." error={err('price_nonmember_euros')}>
            <PriceInput id="offer_price_nonmember_euros" name="price_nonmember_euros" required defaultValue={value('price_nonmember_euros', offer ? formatEuroInput(offer.price_nonmember_cents) : '')} />
          </Field>
        </div>

        <Field label="Status" htmlFor="offer_status" hint="Nur veröffentlichte Angebote sind öffentlich sichtbar und buchbar. Preisänderungen gelten nur für neu angelegte Termine." error={err('status')}>
          <select id="offer_status" name="status" defaultValue={value('status', offer?.status ?? 'draft')} className={INPUT_CLASS} style={INPUT_STYLE}>
            {OFFER_STATUSES.map(status => <option key={status} value={status}>{offerStatusLabel[status]}</option>)}
          </select>
        </Field>
      </section>

      {!pending && state.error && (
        <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" id={feedbackId} role="alert"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
          {state.error}
        </p>
      )}
      {!pending && state.saved && editing && <SuccessNote>Gespeichert.</SuccessNote>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto sm:order-2">
          {pending ? 'Wird gespeichert …' : editing ? 'Speichern' : 'Angebot anlegen'}
        </Button>
        {backButton}
      </div>
    </form>
  )
}
