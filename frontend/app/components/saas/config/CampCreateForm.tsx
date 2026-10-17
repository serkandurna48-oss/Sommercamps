'use client'

import { useActionState } from 'react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { createCampAction, type CampCreateActionState } from '../actions/configActions'

const initialState: CampCreateActionState = { error: null }

/** Eigenständige "Camp anlegen"-Seite (P3-Lücke: es gab bisher nur die
 * Bearbeitung eines bereits existierenden Camps, siehe CampConfigForm, und
 * das Anlegen nur über den Betreiber-Builder oder rohe API-Aufrufe). Ein
 * Verein soll nach dem ersten Camp weitere ohne den Betreiber hinzufügen
 * können. */
export default function CampCreateForm({ orgSlug }: { orgSlug: string }) {
  const boundAction = createCampAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState<CampCreateActionState, FormData>(boundAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <Field label="Slug (Teil der Web-Adresse)" htmlFor="slug" hint="Nur Kleinbuchstaben, Zahlen, Bindestriche — später nicht mehr änderbar.">
          <input id="slug" name="slug" required pattern="[a-z0-9-]+" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Titel" htmlFor="title">
          <input id="title" name="title" required className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Beginn" htmlFor="start_date">
            <input id="start_date" name="start_date" type="date" required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Ende" htmlFor="end_date">
            <input id="end_date" name="end_date" type="date" required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Mindestalter" htmlFor="age_min">
            <input id="age_min" name="age_min" type="number" min={0} required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Höchstalter" htmlFor="age_max">
            <input id="age_max" name="age_max" type="number" min={0} required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Plätze" htmlFor="capacity">
            <input id="capacity" name="capacity" type="number" min={1} required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Preis (in Euro)" htmlFor="price_euros">
            <input id="price_euros" name="price_euros" type="number" min={0} step="0.01" required className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
        </div>
        <label className="cp-body flex items-center gap-2" style={{ color: 'var(--cp-ink-2)' }}>
          <input id="publish_now" name="publish_now" type="checkbox" className="h-5 w-5" />
          Camp sofort veröffentlichen (sonst als Entwurf angelegt — weitere Angaben wie Ort/Betreuung/Leistungen lassen sich danach in der Camp-Konfiguration ergänzen)
        </label>
      </section>

      {state.error && (
        <p
          className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Wird angelegt …' : 'Camp anlegen'}
        </Button>
      </div>
    </form>
  )
}
