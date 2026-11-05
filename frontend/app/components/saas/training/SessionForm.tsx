'use client'

import { useActionState, useId, useState } from 'react'
import { createSessionAction, type TrainingFormState } from '../actions/trainingActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'
import type { OfferKind } from './trainingLogic'

const initialState: TrainingFormState = { error: null }

/** Neuer Termin: Datum und Uhrzeit in Berliner Zeit. Einzeltraining hat immer
 * genau einen Platz (kein Feld), Gruppentraining 1 bis 8. */
export default function SessionForm({ orgSlug, offerId, kind, brandStrong, brandOn }: {
  orgSlug: string
  offerId: string
  kind: OfferKind
  brandStrong: string
  brandOn: string
}) {
  const feedbackId = useId()
  const [submitted, setSubmitted] = useState<Record<string, string>>({})
  const bound = createSessionAction.bind(null, orgSlug, offerId, kind)
  const [state, formAction, pending] = useActionState<TrainingFormState, FormData>(async (previous, data) => {
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    const result = await bound(previous, data)
    // Success clears the form; errors keep the typed values.
    if (result.saved) setSubmitted({})
    return result
  }, initialState)
  const err = (name: string) => (pending ? undefined : state.fieldErrors?.[name])
  const value = (name: string, fallback = '') => submitted[name] ?? fallback

  return (
    <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="cp-card flex flex-col gap-4">
      <h3 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Neuen Termin anlegen</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Datum" htmlFor="session_date" error={err('date')}>
          <input id="session_date" name="date" type="date" required defaultValue={value('date')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Beginn" htmlFor="session_start_time" hint="Uhrzeit in Berliner Zeit." error={err('start_time')}>
          <input id="session_start_time" name="start_time" type="time" required defaultValue={value('start_time')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        {kind === 'gruppe' && (
          <Field label="Plätze" htmlFor="session_capacity" suffix="Plätze" hint="1 bis 8." error={err('capacity')}>
            <input id="session_capacity" name="capacity" type="number" inputMode="numeric" min={1} max={8} required defaultValue={value('capacity')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
        )}
        <Field label="Mindestalter (optional)" htmlFor="session_age_min" suffix="Jahre" hint="Standard: 4 Jahre." error={err('age_min')}>
          <input id="session_age_min" name="age_min" type="number" inputMode="numeric" min={0} max={99} defaultValue={value('age_min')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Höchstalter (optional)" htmlFor="session_age_max" suffix="Jahre" hint="Standard: 18 Jahre." error={err('age_max')}>
          <input id="session_age_max" name="age_max" type="number" inputMode="numeric" min={0} max={99} defaultValue={value('age_max')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Sichtbarkeit" htmlFor="session_status">
          <select id="session_status" name="status" defaultValue={value('status', 'published')} className={INPUT_CLASS} style={INPUT_STYLE}>
            <option value="published">Buchbar, sobald das Angebot veröffentlicht ist</option>
            <option value="draft">Entwurf (nicht buchbar)</option>
          </select>
        </Field>
      </div>
      {!pending && state.error && (
        <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" id={feedbackId} role="alert"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
          {state.error}
        </p>
      )}
      {!pending && state.saved && <SuccessNote>Termin angelegt.</SuccessNote>}
      <div>
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto">
          {pending ? 'Wird angelegt …' : 'Termin anlegen'}
        </Button>
      </div>
    </form>
  )
}
