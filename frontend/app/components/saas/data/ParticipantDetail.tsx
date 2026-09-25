'use client'

import { useActionState, useEffect, useState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction, updateRegistrationDetailsAction } from '../actions/waitlistActions'
import { hasMissingEmergencyContact, hasNotes } from '../commandCenterLogic'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'

/**
 * Inline-Detail (Abschnitt 4.3) — kein Dialog, wächst an Ort und Stelle
 * (M3, gesteuert vom Elternteil ParticipantRow über .cp-collapse).
 * "Nächster Schritt" bot ursprünglich nur mailto:/tel: — "keine Buttons für
 * ... Warteliste-Verschieben, dafür existiert kein Endpunkt". Der
 * Stornieren-Endpunkt existiert inzwischen (backend_saas
 * cancel_registration_and_promote_next, jetzt über POST .../cancel
 * erreichbar), also ist der Button jetzt real, nicht vorgetäuscht. Nur für
 * `status !== 'cancelled'` sichtbar — eine bereits stornierte Anmeldung
 * hat keinen gültigen Übergang zurück zu "cancelled" (siehe
 * registration_lifecycle.ALLOWED_TRANSITIONS).
 */
export default function ParticipantDetail({
  registration,
  orgSlug,
  campSlug,
  onDetailsSaved,
}: {
  registration: RegistrationAdmin
  orgSlug: string
  campSlug: string
  onDetailsSaved?: (registration: RegistrationAdmin) => void
}) {
  const missingContact = hasMissingEmergencyContact(registration)
  const notes = hasNotes(registration)
  const cancel = cancelRegistrationAction.bind(null, orgSlug, campSlug, registration.registration_token)

  const [editing, setEditing] = useState(false)
  const updateDetails = updateRegistrationDetailsAction.bind(null, orgSlug, campSlug, registration.registration_token)
  const [state, formAction, pending] = useActionState(updateDetails, { error: null, saved: false, registration: null })

  const [previousState, setPreviousState] = useState(state)
  if (state !== previousState) {
    setPreviousState(state)
    // Consume each completed save once. The action state stays saved=true
    // until the next submit, so it must not close a newly opened editor.
    if (state.saved && state.registration) setEditing(false)
  }

  /** `onDetailsSaved` gehört in einen Effect, nicht in den Render-Zweig
   * oben (Bug, per Next.js-Fehlerüberlage gefunden): jene `setEditing`-
   * Anpassung ist eigener State dieser Komponente und darf laut React
   * direkt im Render laufen — ein Callback, der STATE DER ELTERN-
   * KOMPONENTE (ParticipantRow.setOverride) ändert, ist das nicht
   * ("Cannot update a component while rendering a different component"). */
  useEffect(() => {
    if (state.saved && state.registration) onDetailsSaved?.(state.registration)
  }, [state, onDetailsSaved])

  return (
    <div className="grid grid-cols-1 gap-6 border-t px-5 py-5 md:grid-cols-2" style={{ borderColor: 'var(--cp-line-2)' }}>
      <div className="md:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="cp-label" style={{ color: 'var(--cp-muted)' }}>
            {de.command.participants}
          </p>
          {!editing && (
            <button type="button" className="cp-chip underline" onClick={() => setEditing(true)}>
              {de.command.editParticipant}
            </button>
          )}
        </div>

        {editing ? (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={de.command.fieldChildFirstName} htmlFor="child_first_name">
                <input
                  id="child_first_name"
                  name="child_first_name"
                  required
                  defaultValue={registration.child_first_name}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldChildLastName} htmlFor="child_last_name">
                <input
                  id="child_last_name"
                  name="child_last_name"
                  required
                  defaultValue={registration.child_last_name}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldJerseySize} htmlFor="jersey_size">
                <input
                  id="jersey_size"
                  name="jersey_size"
                  defaultValue={registration.jersey_size ?? ''}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldPickupAuthorized} htmlFor="pickup_authorized">
                <input
                  id="pickup_authorized"
                  name="pickup_authorized"
                  defaultValue={registration.pickup_authorized ?? ''}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>
            <Field label={de.command.fieldAllergies} htmlFor="allergies">
              <textarea
                id="allergies"
                name="allergies"
                rows={2}
                defaultValue={registration.allergies ?? ''}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            {state.error && (
              <p className="cp-chip" style={{ color: 'var(--cp-error)' }} role="alert">
                {state.error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? de.command.editParticipantSaving : de.command.editParticipantSave}
              </Button>
              <Button type="button" variant="quiet" disabled={pending} onClick={() => setEditing(false)}>
                {de.command.editParticipantCancel}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                {de.command.fieldJerseySize}
              </dt>
              <dd className="cp-body">{registration.jersey_size ?? '—'}</dd>
            </div>
            <div>
              <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                {de.command.fieldPickupAuthorized}
              </dt>
              <dd className="cp-body">{registration.pickup_authorized ?? '—'}</dd>
            </div>
          </dl>
        )}
      </div>

      <div>
        <p className="cp-label mb-2" style={{ color: 'var(--cp-muted)' }}>
          {de.command.whatIsMissing}
        </p>
        <div className="flex flex-col gap-2">
          {missingContact && (
            <p
              className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}
            >
              {de.command.missingEmergencyContact}
            </p>
          )}
          {notes && (
            <div
              className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ color: 'var(--cp-info)', background: 'var(--cp-info-bg)', borderColor: 'var(--cp-info-line)' }}
            >
              <p className="cp-label mb-1">{de.command.hasAllergies}</p>
              {registration.allergies && <p>{registration.allergies}</p>}
              {registration.medical_notes && <p>{registration.medical_notes}</p>}
            </div>
          )}
          {!missingContact && !notes && (
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
              {de.command.nothingMissing}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="cp-label mb-2" style={{ color: 'var(--cp-muted)' }}>
          {de.command.nextStep}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`mailto:${registration.parent_email}`}>
            <Button variant="secondary">E-Mail schreiben</Button>
          </a>
          <a href={`tel:${registration.parent_phone}`}>
            <Button variant="secondary">Anrufen</Button>
          </a>
        </div>
        {registration.status !== 'cancelled' && (
          <div className="mt-4">
            <ActionForm action={cancel} label="Anmeldung stornieren" pendingLabel="Wird storniert …" variant="quiet" />
          </div>
        )}
      </div>
    </div>
  )
}
