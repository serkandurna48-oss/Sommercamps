'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'
import { useId, useActionState, useState, type ReactNode } from 'react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import PriceInput from '../ui/PriceInput'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { createCampAction, type CampCreateActionState } from '../actions/configActions'
import { suggestCampSlug, type CampDuplicate } from './campDuplicate'
import { localInputToIso, toLocalInputValue } from '../../../lib/dateTimeInput'

export { suggestCampSlug } from './campDuplicate'

const initialState: CampCreateActionState = { error: null }

/** Eigenständige "Camp anlegen"-Seite (P3-Lücke: es gab bisher nur die
 * Bearbeitung eines bereits existierenden Camps, siehe CampConfigForm, und
 * das Anlegen nur über den Betreiber-Builder oder rohe API-Aufrufe). Ein
 * Verein soll nach dem ersten Camp weitere ohne den Betreiber hinzufügen
 * können. */
export default function CampCreateForm({
  orgSlug,
  brandStrong,
  brandOn,
  backButton,
  initialValues,
}: {
  orgSlug: string
  brandStrong: string
  brandOn: string
  backButton?: ReactNode
  initialValues?: CampDuplicate
}) {
  const feedbackId = useId()
  const preview = useAdminPreview()
  const boundAction = preview ? previewNoopAction : createCampAction.bind(null, orgSlug)
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [customSlug, setCustomSlug] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Record<string, string>>({})
  const [state, formAction, pending] = useActionState<CampCreateActionState, FormData>(async (previous, data) => {
    // Preserve uncontrolled values when React resets a resolved form action.
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    if (initialValues) {
      try {
        for (const field of ['registration_start', 'registration_end'] as const) {
          data.set(field, localInputToIso(data.get(field), initialValues[field]))
        }
      } catch {
        return { error: 'Bitte prüfen Sie die Anmeldezeiten in Ihrer Zeitzone.' }
      }
    }
    return boundAction(previous, data)
  }, initialState)

  return (
    <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="flex flex-col gap-4">
      <section className="cp-card flex flex-col gap-4">
        <Field label="Titel" htmlFor="title">
          <input id="title" name="title" required value={title} onChange={event => setTitle(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Web-Adresse" htmlFor="slug" hint="Aus Ihrem Titel vorgeschlagen. Sie können sie vor dem Anlegen ändern: Kleinbuchstaben, Zahlen und Bindestriche.">
          <input id="slug" name="slug" required pattern="[a-z0-9\-]+" value={customSlug ?? suggestCampSlug(title)} onChange={event => setCustomSlug(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Beginn" htmlFor="start_date">
            <input id="start_date" name="start_date" type="date" required defaultValue={submitted.start_date ?? initialValues?.start_date ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Ende" htmlFor="end_date">
            <input id="end_date" name="end_date" type="date" required defaultValue={submitted.end_date ?? initialValues?.end_date ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Mindestalter" htmlFor="age_min" suffix="Jahre" hint="Zum Beispiel 7 Jahre.">
            <input id="age_min" name="age_min" type="number" inputMode="numeric" min={0} required defaultValue={submitted.age_min ?? initialValues?.age_min ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Höchstalter" htmlFor="age_max" suffix="Jahre" hint="Zum Beispiel 13 Jahre.">
            <input id="age_max" name="age_max" type="number" inputMode="numeric" min={0} required defaultValue={submitted.age_max ?? initialValues?.age_max ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Plätze" htmlFor="capacity" suffix="Plätze" hint="Zum Beispiel 24 Plätze.">
            <input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} required defaultValue={submitted.capacity ?? initialValues?.capacity ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={initialValues ? 'Preis' : 'Preis (in Euro)'} htmlFor="price_euros" suffix={initialValues ? undefined : '€'} hint={initialValues ? 'In der angegebenen Währung, zum Beispiel 189,00.' : 'Zum Beispiel 189,00 €.'}>
            <PriceInput id="price_euros" name="price_euros" required defaultValue={submitted.price_euros ?? (initialValues ? (initialValues.price_cents / 100).toFixed(2) : '')} />
          </Field>
        </div>
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>{initialValues ? 'Die Kopie wird als Entwurf angelegt. Bitte wählen Sie einen neuen Termin und prüfen Sie den übernommenen Anmeldezeitraum. Die Zusatzfragen Ihres Vereins gelten auch für dieses Camp.' : 'Ihr Camp wird als Entwurf angelegt. Ergänzen Sie danach Ort und Ablauf, bevor Sie es veröffentlichen.'}</p>
      </section>

      {initialValues && <section className="cp-card flex flex-col gap-4">
        <input type="hidden" name="duplicate" value="1" />
        <input type="hidden" name="includes_null" value={initialValues.includes === null ? '1' : '0'} />
        <Field label="Währung" htmlFor="currency">
          <input id="currency" name="currency" required pattern="[A-Z]{3}" defaultValue={submitted.currency ?? initialValues.currency} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        {(['registration_start', 'registration_end'] as const).map(field => <Field key={field} label={field === 'registration_start' ? 'Anmeldung ab' : 'Anmeldung bis'} htmlFor={field}>
          <input id={field} name={field} type="datetime-local" defaultValue={submitted[field] ?? toLocalInputValue(initialValues[field])} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>)}
        {([
          ['location', 'Ort'], ['care_info', 'Betreuung'], ['meals_info', 'Verpflegung'], ['includes', 'Leistungen (eine pro Zeile)'],
        ] as const).map(([field, label]) => <Field key={field} label={label} htmlFor={field}>
          <textarea id={field} name={field} rows={2} defaultValue={submitted[field] ?? (field === 'includes' ? initialValues.includes?.join('\n') : initialValues[field]) ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>)}
      </section>}

      {!pending && state.error && (
        <p
          className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
          id={feedbackId} role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto sm:order-2">
          {pending ? 'Wird angelegt …' : 'Camp anlegen'}
        </Button>
        {backButton}
      </div>
    </form>
  )
}
