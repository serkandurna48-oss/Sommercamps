'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'

import { useId, useActionState, useState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import { updateOrganizationConfigAction, type ConfigActionState } from '../actions/configActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'
import PendingNote from '../state/PendingNote'
import PublishToggle from './PublishToggle'
import { isAllowedImageUrl } from '../../../lib/imageUrl'

const _URL_FIELDS = ['logo_url', 'hero_image_url', 'trainer_image_url'] as const
type _UrlField = typeof _URL_FIELDS[number]
const _URL_ERROR_MSG = 'Bitte eine https-Adresse oder einen Pfad wie /clubs/verein/logo.png eintragen.'

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
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null)
  const [previousOrg, setPreviousOrg] = useState(org)
  const [urlErrors, setUrlErrors] = useState<Partial<Record<_UrlField, string>>>({})
  if (org !== previousOrg) {
    setPreviousOrg(org)
    setSubmitted(null)
    setUrlErrors({})
  }
  const inputValue = (field: string, fallback: string) => submitted?.[field] ?? fallback
  const feedbackId = useId()
  const preview = useAdminPreview()
  const boundAction = preview ? previewNoopAction : updateOrganizationConfigAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(async (previous, data) => {
    // React resets uncontrolled fields after a resolved action, including
    // failures. Keep submitted defaults until fresh props arrive.
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))

    const invalidFields = _URL_FIELDS.filter(f => {
      const v = data.get(f)
      return typeof v === 'string' && !isAllowedImageUrl(v)
    })
    if (invalidFields.length > 0) {
      setUrlErrors(Object.fromEntries(invalidFields.map(f => [f, _URL_ERROR_MSG])) as Partial<Record<_UrlField, string>>)
      return { error: null, saved: false }
    }
    setUrlErrors({})
    return boundAction(previous, data)
  }, { error: null, saved: false })

  return (
    <div className="flex flex-col gap-10">
      <PublishToggle orgSlug={orgSlug} published={org.site_published} brandStrong={brandStrong} brandOn={brandOn} />

      <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="flex flex-col gap-8">
        {Object.values(urlErrors).some(Boolean) && (
          <p
            className="cp-confirm-pop cp-body rounded-[var(--cp-r-chip)] border px-3 py-2 motion-reduce:animate-none"
            style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
            role="alert"
          >
            {_URL_ERROR_MSG}
          </p>
        )}
        <section className="flex flex-col gap-4">
          <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            {de.configPage.section.branding}
          </h3>
          <Field label={de.configPage.field.name} htmlFor="name">
            <input id="name" name="name" required defaultValue={inputValue('name', org.name)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.legalName} htmlFor="legal_name">
            <input id="legal_name" name="legal_name" defaultValue={inputValue('legal_name', org.legal_name ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field
            label="Anschrift (für Impressum/Datenschutz)"
            htmlFor="legal_address"
            hint="Straße, PLZ, Ort – erscheint auf der öffentlichen Impressum-/Datenschutzseite dieses Vereins. Ohne diese Angabe zeigt die Seite ehrlich „noch nicht angegeben“, nie die Daten eines anderen Vereins."
          >
            <textarea
              id="legal_address"
              name="legal_address"
              rows={2}
              defaultValue={inputValue('legal_address', org.legal_address ?? '')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Ansprechpartner" htmlFor="contact_person_name" hint="Name der Person, die für diesen Verein zuständig ist.">
            <input
              id="contact_person_name"
              name="contact_person_name"
              defaultValue={inputValue('contact_person_name', org.contact_person_name ?? '')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.logoUrl} htmlFor="logo_url" error={urlErrors.logo_url}>
            <input id="logo_url" name="logo_url" type="text" inputMode="url" defaultValue={inputValue('logo_url', org.logo_url ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.primaryColor} htmlFor="primary_color" hint={de.configPage.hint.primaryColor}>
            <div className="flex items-center gap-3">
              <input
                id="primary_color"
                name="primary_color"
                defaultValue={inputValue('primary_color', org.primary_color ?? '')}
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
              defaultValue={inputValue('contact_email', org.contact_email)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.contactPhone} htmlFor="contact_phone">
            <input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              defaultValue={inputValue('contact_phone', org.contact_phone ?? '')}
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
              defaultValue={inputValue('intro_heading', org.intro_heading ?? '')}
              placeholder={org.name}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Einführungstext" htmlFor="intro_text">
            <textarea id="intro_text" name="intro_text" rows={3} defaultValue={inputValue('intro_text', org.intro_text ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label="Titelbild-URL" htmlFor="hero_image_url" hint="Kein Upload in dieser Version – Bild extern hochladen und die URL hier eintragen." error={urlErrors.hero_image_url}>
            <input
              id="hero_image_url"
              name="hero_image_url"
              type="text"
              inputMode="url"
              defaultValue={inputValue('hero_image_url', org.hero_image_url ?? '')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Trainer-Bild-URL" htmlFor="trainer_image_url" hint="Kein Upload in dieser Version – Bild extern hochladen und die URL hier eintragen." error={urlErrors.trainer_image_url}>
            <input
              id="trainer_image_url"
              name="trainer_image_url"
              type="text"
              inputMode="url"
              defaultValue={inputValue('trainer_image_url', org.trainer_image_url ?? '')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Trainer-Text" htmlFor="trainer_text" hint="Ein bis zwei Sätze. Erscheint auf der Elternseite zusammen mit dem Ansprechpartner als Name. Ohne Trainer-Bild-URL wird die Sektion nicht angezeigt.">
            <textarea
              id="trainer_text"
              name="trainer_text"
              rows={2}
              defaultValue={inputValue('trainer_text', org.trainer_text ?? '')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            Teilnahmebedingungen
          </h3>
          <Field
            label="Teilnahme- und Stornobedingungen (wird Eltern auf der Seite Teilnahmebedingungen angezeigt)"
            htmlFor="terms_text"
            hint="Absätze durch Leerzeile trennen."
          >
            <textarea
              id="terms_text"
              name="terms_text"
              rows={6}
              defaultValue={inputValue('terms_text', org.terms_text ?? '')}
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
              defaultValue={inputValue('iban', org.iban ?? '')}
              placeholder="DE89370400440532013000"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            Zusatzfragen bei der Anmeldung
          </h3>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            Bis zu 5 Fragen. Eltern beantworten diese zusätzlich beim Anmeldeformular. Leer lassen für keine Zusatzfragen.
          </p>
          <Field
            label="Fragen (JSON)"
            htmlFor="registration_questions"
            hint='Jede Frage als Objekt: { "key": "position", "label": "Position", "type": "choice", "options": ["Feldspieler", "Torwart"], "other_label": null, "required": true }'
          >
            <textarea
              id="registration_questions"
              name="registration_questions"
              rows={6}
              defaultValue={inputValue('registration_questions', JSON.stringify(org.registration_questions ?? [], null, 2))}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              placeholder="[]"
            />
          </Field>
        </section>

        {pending && <PendingNote>{de.configPage.saving}</PendingNote>}
        {!pending && state.error && (
          <p
            className="cp-confirm-pop cp-body rounded-[var(--cp-r-chip)] border px-3 py-2 motion-reduce:animate-none"
            style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
            id={feedbackId} role="alert"
          >
            {state.error}
          </p>
        )}
        {!pending && state.saved && !state.error && <SuccessNote>{de.configPage.saved}</SuccessNote>}

        <div>
          <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn}>
            {pending ? de.configPage.saving : de.configPage.save}
          </Button>
        </div>
      </form>
    </div>
  )
}

