'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import Button from '../../../components/saas/ui/Button'
import Field from '../../../components/saas/ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../../../components/saas/ui/formFieldStyles'
import { createOrganizationWithCampAction, type NewOrgState } from './actions'

const initialState: NewOrgState = { error: null, orgCreatedSlug: null }

/** Ein Schritt, ein Formular: Verein + erstes Camp zusammen anlegen —
 * genau das "Verein in 1-2 Stunden startklar bekommen"-Bedürfnis, ohne
 * curl/JSON-Datei/Skript. Weitere Camps kommen danach über die normale
 * Vereins-Verwaltung (/pilot/[org]/(org-admin)) hinzu. */
export default function NewOrgForm() {
  const [state, formAction, pending] = useActionState(createOrganizationWithCampAction, initialState)

  if (state.orgCreatedSlug) {
    return (
      <div
        className="cp-body rounded-[var(--cp-r-card)] border p-6"
        style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface)' }}
      >
        <p className="mb-4" style={{ color: 'var(--cp-error)' }} role="alert">
          {state.error}
        </p>
        <Link
          href={`/pilot/${state.orgCreatedSlug}/dashboard`}
          className="cp-subheading inline-flex min-h-[50px] items-center justify-center rounded-[var(--cp-r-field)] px-5"
          style={{ background: 'var(--cp-ink)', color: '#FFFFFF' }}
        >
          Zur Verwaltung von „{state.orgCreatedSlug}&ldquo;
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          Verein
        </h2>
        <Field
          label={'Slug (Teil der Web-Adresse, z. B. „musterverein")'}
          htmlFor="org_slug"
          hint="Nur Kleinbuchstaben, Zahlen, Bindestriche — später nicht mehr änderbar."
        >
          <input id="org_slug" name="org_slug" required pattern="[a-z0-9-]+" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Vereinsname" htmlFor="org_name">
          <input id="org_name" name="org_name" required className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Ansprechpartner (optional)" htmlFor="contact_person_name">
          <input id="contact_person_name" name="contact_person_name" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Kontakt-E-Mail" htmlFor="contact_email">
          <input id="contact_email" name="contact_email" type="email" required className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Kontakt-Telefon (optional)" htmlFor="contact_phone">
          <input id="contact_phone" name="contact_phone" type="tel" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Vereinsfarbe (optional)" htmlFor="primary_color" hint="Hex-Code, z. B. #1c6b45.">
          <input id="primary_color" name="primary_color" placeholder="#1c6b45" className={INPUT_CLASS} style={{ ...INPUT_STYLE, maxWidth: '180px' }} />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          Erstes Camp
        </h2>
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          Weitere Camps können danach in der Vereins-Verwaltung ergänzt werden.
        </p>
        <Field label="Slug (Teil der Web-Adresse)" htmlFor="camp_slug">
          <input id="camp_slug" name="camp_slug" required pattern="[a-z0-9-]+" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Titel" htmlFor="camp_title">
          <input id="camp_title" name="camp_title" required className={INPUT_CLASS} style={INPUT_STYLE} />
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
          Camp sofort veröffentlichen (sonst als Entwurf angelegt, Eltern sehen es noch nicht)
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
          {pending ? 'Wird angelegt …' : 'Verein anlegen'}
        </Button>
      </div>
    </form>
  )
}
