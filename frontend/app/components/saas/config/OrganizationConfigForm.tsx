'use client'

import { useActionState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { OrganizationPublic } from '../../../lib/saasApi'
import { updateOrganizationConfigAction, type ConfigActionState } from '../actions/configActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'

/**
 * Kein Theme-Editor (Auftrag Abschnitt 1) — `org.theme` erscheint hier
 * absichtlich nicht als Feld, auch nicht read-only, um keinen Eindruck von
 * "das könnte man ändern" zu erzeugen.
 */
export default function OrganizationConfigForm({
  orgSlug,
  org,
  brandStrong,
  brandOn,
}: {
  orgSlug: string
  org: OrganizationPublic
  brandStrong: string
  brandOn: string
}) {
  const boundAction = updateOrganizationConfigAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(boundAction, { error: null, saved: false })

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.branding}
        </h3>
        <Field label={de.configPage.field.name} htmlFor="name">
          <input id="name" name="name" required defaultValue={org.name} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.legalName} htmlFor="legal_name">
          <input id="legal_name" name="legal_name" defaultValue={org.legal_name ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.logoUrl} htmlFor="logo_url">
          <input id="logo_url" name="logo_url" type="url" defaultValue={org.logo_url ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.primaryColor} htmlFor="primary_color" hint={de.configPage.hint.primaryColor}>
          <div className="flex items-center gap-3">
            <input
              id="primary_color"
              name="primary_color"
              defaultValue={org.primary_color ?? ''}
              placeholder="#1c6b45"
              className={INPUT_CLASS}
              style={{ ...INPUT_STYLE, maxWidth: '180px' }}
            />
            {org.primary_color && (
              <span
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-[var(--cp-r-chip)] border"
                style={{ background: org.primary_color, borderColor: 'var(--cp-field-line)' }}
              />
            )}
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.contact}
        </h3>
        <Field label={de.configPage.field.contactEmail} htmlFor="contact_email">
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            defaultValue={org.contact_email}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
        <Field label={de.configPage.field.contactPhone} htmlFor="contact_phone">
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            defaultValue={org.contact_phone ?? ''}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.payment}
        </h3>
        <Field label={de.configPage.field.iban} htmlFor="iban">
          <input
            id="iban"
            name="iban"
            defaultValue={org.iban ?? ''}
            placeholder="DE89370400440532013000"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
      </section>

      {state.error && (
        <p
          className="cp-confirm-pop cp-body rounded-[var(--cp-r-chip)] border px-3 py-2 motion-reduce:animate-none"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
          role="alert"
        >
          {state.error}
        </p>
      )}
      {state.saved && !state.error && <SuccessNote>{de.configPage.saved}</SuccessNote>}

      <div>
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn}>
          {pending ? de.configPage.saving : de.configPage.save}
        </Button>
      </div>
    </form>
  )
}
