'use client'

import { useActionState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import { updateOrganizationConfigAction, type ConfigActionState } from '../actions/configActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'
import PublishToggle from './PublishToggle'

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
  org: OrganizationAdmin
  brandStrong: string
  brandOn: string
}) {
  const boundAction = updateOrganizationConfigAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(boundAction, { error: null, saved: false })

  return (
    <div className="flex flex-col gap-10">
      <PublishToggle orgSlug={orgSlug} published={org.site_published} />

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
          <Field
            label="Anschrift (für Impressum/Datenschutz)"
            htmlFor="legal_address"
            hint="Straße, PLZ, Ort — erscheint auf der öffentlichen Impressum-/Datenschutzseite dieses Vereins. Ohne diese Angabe zeigt die Seite ehrlich „noch nicht angegeben”, nie die Daten eines anderen Vereins."
          >
            <textarea
              id="legal_address"
              name="legal_address"
              rows={2}
              defaultValue={org.legal_address ?? ''}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Ansprechpartner" htmlFor="contact_person_name" hint="Name der Person, die für diesen Verein zuständig ist.">
            <input
              id="contact_person_name"
              name="contact_person_name"
              defaultValue={org.contact_person_name ?? ''}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
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
            Website-Inhalte
          </h3>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            Erscheinen auf der öffentlichen Vereinsseite. Leer lassen für die Standard-Gestaltung.
          </p>
          <Field label="Überschrift" htmlFor="intro_heading">
            <input
              id="intro_heading"
              name="intro_heading"
              defaultValue={org.intro_heading ?? ''}
              placeholder={org.name}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Einführungstext" htmlFor="intro_text">
            <textarea id="intro_text" name="intro_text" rows={3} defaultValue={org.intro_text ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Titelbild-URL" htmlFor="hero_image_url" hint="Kein Upload in dieser Version — Bild extern hochladen und die URL hier eintragen.">
            <input
              id="hero_image_url"
              name="hero_image_url"
              type="url"
              defaultValue={org.hero_image_url ?? ''}
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

        <section className="flex flex-col gap-4">
          <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            Abrechnung
          </h3>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            Nur für dich als Betreiber sichtbar, nie öffentlich. Vertragsstatus selbst steht auf der Plattform-Konsole.
          </p>
          <Field label="Konditionen" htmlFor="billing_notes" hint="Freitext, z. B. vereinbarter Preis, Rechnungsintervall, Startdatum.">
            <textarea id="billing_notes" name="billing_notes" rows={2} defaultValue={org.billing_notes ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
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
    </div>
  )
}

