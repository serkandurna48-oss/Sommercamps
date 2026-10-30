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
import RegistrationQuestionsBuilder from './RegistrationQuestionsBuilder'
import BrandPreview, { previewTheme } from '../brand/BrandPreview'
import ColorField, { normalizeHex } from '../brand/ColorField'
import { isAllowedImageUrl } from '../../../lib/imageUrl'

const _URL_FIELDS = ['logo_url', 'hero_image_url', 'trainer_image_url'] as const
type _UrlField = typeof _URL_FIELDS[number]
const _URL_ERROR_MSG = 'Bitte eine https-Adresse oder einen Pfad wie /clubs/verein/logo.png eintragen.'

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
  const [name, setName] = useState(org.name)
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '')
  const [color, setColor] = useState(org.primary_color ?? '')
  const [theme, setTheme] = useState(previewTheme(org.theme))
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null)
  const [previousOrg, setPreviousOrg] = useState(org)
  const [urlErrors, setUrlErrors] = useState<Partial<Record<_UrlField, string>>>({})
  if (org !== previousOrg) {
    setPreviousOrg(org)
    setName(org.name)
    setLogoUrl(org.logo_url ?? '')
    setColor(org.primary_color ?? '')
    setTheme(previewTheme(org.theme))
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

    setName(String(data.get('name') ?? ''))
    setLogoUrl(String(data.get('logo_url') ?? ''))
    const submittedColor = String(data.get('primary_color') ?? '')
    setColor(submittedColor)

    const invalidFields = _URL_FIELDS.filter(f => {
      const v = data.get(f)
      return typeof v === 'string' && !isAllowedImageUrl(v)
    })
    if (invalidFields.length > 0) {
      setUrlErrors(Object.fromEntries(invalidFields.map(f => [f, _URL_ERROR_MSG])) as Partial<Record<_UrlField, string>>)
      return { error: null, saved: false }
    }
    setUrlErrors({})
    if (submittedColor && !normalizeHex(submittedColor)) return { error: null, saved: false }
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
          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <Field label={de.configPage.field.name} htmlFor="name">
                <input id="name" name="name" required value={name} onChange={event => setName(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
              </Field>
              <Field label={de.configPage.field.logoUrl} htmlFor="logo_url" error={urlErrors.logo_url}>
                <input id="logo_url" name="logo_url" type="text" inputMode="url" value={logoUrl} onChange={event => setLogoUrl(event.target.value)} className={INPUT_CLASS} style={INPUT_STYLE} />
              </Field>
              <ColorField id="primary_color" value={color} onChange={setColor} />
              <Field label="Theme für die Vorschau" htmlFor="preview-theme" hint="Vergleichen Sie hier die Gestaltung. Diese Auswahl wird nicht gespeichert; Ihre Vereinsseite behält das bisherige Theme.">
                <select id="preview-theme" value={theme} onChange={event => setTheme(previewTheme(event.target.value))} className={INPUT_CLASS} style={INPUT_STYLE}>
                  <option value="tradition">Tradition</option>
                  <option value="akademie">Akademie</option>
                  <option value="kompakt">Kompakt</option>
                </select>
              </Field>
            </div>
            <BrandPreview name={name} logoUrl={logoUrl} color={color} theme={theme} />
          </div>

          <Field label={de.configPage.field.legalName} htmlFor="legal_name">
            <input id="legal_name" name="legal_name" defaultValue={inputValue('legal_name', org.legal_name ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field
            label="Anschrift (für Impressum/Datenschutz)"
            htmlFor="legal_address"
            hint="Straße, PLZ, Ort – bei einem e.V. zusätzlich „Vertreten durch: …“ (Vorstand) und „Vereinsregister: Amtsgericht …, VR …“, je eine Zeile. Erscheint auf der öffentlichen Impressum-/Datenschutzseite dieses Vereins. Ohne diese Angabe zeigt die Seite ehrlich „noch nicht angegeben“, nie die Daten eines anderen Vereins."
          >
            <textarea
              id="legal_address"
              name="legal_address"
              rows={4}
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

        <RegistrationQuestionsBuilder value={org.registration_questions} theme={org.theme} orgSlug={orgSlug} disabled={pending} />

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

