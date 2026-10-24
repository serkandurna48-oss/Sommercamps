'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'
import { useId, useActionState, useState, type ReactNode } from 'react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import PriceInput from '../ui/PriceInput'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { createCampAction, type CampCreateActionState } from '../actions/configActions'

const initialState: CampCreateActionState = { error: null }

export function suggestCampSlug(title: string): string {
  return title.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

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
}: {
  orgSlug: string
  brandStrong: string
  brandOn: string
  backButton?: ReactNode
}) {
  const feedbackId = useId()
  const preview = useAdminPreview()
  const boundAction = preview ? previewNoopAction : createCampAction.bind(null, orgSlug)
  const [title, setTitle] = useState('')
  const [customSlug, setCustomSlug] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Record<string, string>>({})
  const [state, formAction, pending] = useActionState<CampCreateActionState, FormData>(async (previous, data) => {
    // Preserve uncontrolled values when React resets a resolved form action.
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    return boundAction(previous, data)
  }, initialState)

  return (
    <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="flex flex-col gap-4">
      <section className="cp-card flex flex-col gap-4">
        <Field label="Titel" htmlFor="title">
          <input id="title" name="title" required value={title} onChange={event => setTitle(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Web-Adresse" htmlFor="slug" hint="Aus Ihrem Titel vorgeschlagen. Sie können sie vor dem Anlegen ändern: Kleinbuchstaben, Zahlen und Bindestriche.">
          <input id="slug" name="slug" required pattern="[a-z0-9-]+" value={customSlug ?? suggestCampSlug(title)} onChange={event => setCustomSlug(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Beginn" htmlFor="start_date">
            <input id="start_date" name="start_date" type="date" required defaultValue={submitted.start_date ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Ende" htmlFor="end_date">
            <input id="end_date" name="end_date" type="date" required defaultValue={submitted.end_date ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Mindestalter" htmlFor="age_min" suffix="Jahre" hint="Zum Beispiel 7 Jahre.">
            <input id="age_min" name="age_min" type="number" inputMode="numeric" min={0} required defaultValue={submitted.age_min ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Höchstalter" htmlFor="age_max" suffix="Jahre" hint="Zum Beispiel 13 Jahre.">
            <input id="age_max" name="age_max" type="number" inputMode="numeric" min={0} required defaultValue={submitted.age_max ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Plätze" htmlFor="capacity" suffix="Plätze" hint="Zum Beispiel 24 Plätze.">
            <input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} required defaultValue={submitted.capacity ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Preis (in Euro)" htmlFor="price_euros" suffix="€" hint="Zum Beispiel 189,00 €.">
            <PriceInput id="price_euros" name="price_euros"    required defaultValue={submitted.price_euros ?? ''}   />
          </Field>
        </div>
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>Ihr Camp wird als Entwurf angelegt. Ergänzen Sie danach Ort und Ablauf, bevor Sie es veröffentlichen.</p>
      </section>

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
