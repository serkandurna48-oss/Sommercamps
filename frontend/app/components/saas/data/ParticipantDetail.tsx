'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'

import { useActionState, useEffect, useId, useState } from 'react'
import { de, paymentStatusLabel } from '../../../lib/i18n/de'
import type { RegistrationAdmin, RegistrationQuestion } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction, resendRegistrationMailAction, updateRegistrationDetailsAction } from '../actions/waitlistActions'
import { setPaymentStatusAction } from '../actions/paymentActions'
import { hasMissingEmergencyContact, hasNotes, isOpenPayment, canReopenPayment } from '../commandCenterLogic'
import ActionForm from '../ui/ActionForm'
import { useRegistrationActionFeedback } from '../ui/RegistrationActionFeedback'
import Button, { ButtonLink } from '../ui/Button'
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
  campTitle,
  questions = [],
  brandStrong,
  brandOn,
  onDetailsSaved,
}: {
  registration: RegistrationAdmin
  orgSlug: string
  campSlug: string
  campTitle: string
  questions?: RegistrationQuestion[]
  brandStrong: string
  brandOn: string
  onDetailsSaved?: (registration: RegistrationAdmin) => void
}) {
  const editorId = useId()
  const fieldId = (name: string) => `${editorId}-${name}`
  const missingContact = hasMissingEmergencyContact(registration)
  const notes = hasNotes(registration)
  const reportResult = useRegistrationActionFeedback()
  const childName = `${registration.child_first_name} ${registration.child_last_name}`
  const cancel: React.ComponentProps<typeof ActionForm>['action'] = async (previous) => {
    const result = await cancelRegistrationAction(orgSlug, campSlug, registration.registration_token, previous)
    return result.success ? { ...result, success: `${childName} storniert.` } : result
  }
  const previewMode = useAdminPreview()
  const resendMail: React.ComponentProps<typeof ActionForm>['action'] = previewMode
    ? async () => ({ error: null, success: 'Vorschau: Es wird keine Mail gesendet.' })
    : resendRegistrationMailAction.bind(null, orgSlug, campSlug, registration.registration_token)
  const mailFailed = Boolean(registration.email_error)
  const markPaid = setPaymentStatusAction.bind(null, orgSlug, campSlug, registration.registration_token, 'paid', de.paymentsPage.markPaidSuccess)
  const markWaived = setPaymentStatusAction.bind(null, orgSlug, campSlug, registration.registration_token, 'waived', de.paymentsPage.markWaivedSuccess)
  const markRefunded = setPaymentStatusAction.bind(null, orgSlug, campSlug, registration.registration_token, 'refunded', de.paymentsPage.markRefundedSuccess)
  const markOpen = setPaymentStatusAction.bind(null, orgSlug, campSlug, registration.registration_token, 'open', de.paymentsPage.markOpenSuccess)

  const [editing, setEditing] = useState(false)
  const preview = useAdminPreview()
  const updateDetails = preview ? previewNoopAction : updateRegistrationDetailsAction.bind(null, orgSlug, campSlug, registration.registration_token)
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
            <Button type="button" onClick={() => setEditing(true)}>
              {de.command.editParticipant}
            </Button>
          )}
        </div>

        {editing ? (
          <form action={formAction} aria-describedby={state.error ? `${editorId}-error` : undefined} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={de.command.fieldChildFirstName} htmlFor={fieldId('child_first_name')}>
                <input
                  id={fieldId('child_first_name')}
                  name="child_first_name"
                  required
                  defaultValue={registration.child_first_name}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldChildLastName} htmlFor={fieldId('child_last_name')}>
                <input
                  id={fieldId('child_last_name')}
                  name="child_last_name"
                  required
                  defaultValue={registration.child_last_name}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldJerseySize} htmlFor={fieldId('jersey_size')}>
                <input
                  id={fieldId('jersey_size')}
                  name="jersey_size"
                  defaultValue={registration.jersey_size ?? ''}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldPickupAuthorized} htmlFor={fieldId('pickup_authorized')}>
                <input
                  id={fieldId('pickup_authorized')}
                  name="pickup_authorized"
                  defaultValue={registration.pickup_authorized ?? ''}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label={de.command.fieldParentEmail} htmlFor={fieldId('parent_email')}>
                <input
                  id={fieldId('parent_email')}
                  name="parent_email"
                  type="email"
                  required
                  defaultValue={registration.parent_email}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>
            <Field label={de.command.fieldAllergies} htmlFor={fieldId('allergies')}>
              <textarea
                id={fieldId('allergies')}
                name="allergies"
                rows={2}
                defaultValue={registration.allergies ?? ''}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            {state.error && (
              <p id={`${editorId}-error`} className="cp-chip" style={{ color: 'var(--cp-error)' }} role="alert">
                {state.error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn}>
                {pending ? de.command.editParticipantSaving : de.command.editParticipantSave}
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditing(false)}>
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
              <dd className="cp-body">{registration.jersey_size ?? '–'}</dd>
            </div>
            <div>
              <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                {de.command.fieldPickupAuthorized}
              </dt>
              <dd className="cp-body">{registration.pickup_authorized ?? '–'}</dd>
            </div>
          </dl>
        )}
      </div>

      {questions.length > 0 && (
        <section className="md:col-span-2" aria-label="Zusatzantworten">
          <h3 className="cp-label mb-2" style={{ color: 'var(--cp-muted)' }}>Zusatzantworten</h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {questions.map(question => <div key={question.key}>
              <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{question.label}</dt>
              <dd className="cp-body">{registration.extra_answers?.[question.key] || '–'}</dd>
            </div>)}
          </dl>
        </section>
      )}

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
          <ButtonLink href={`mailto:${registration.parent_email}`}>
            E-Mail schreiben
          </ButtonLink>
          <ButtonLink href={`tel:${registration.parent_phone}`}>
            Anrufen
          </ButtonLink>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="E-Mail an die Familie">
          {mailFailed ? (
            <>
              <p className="cp-body" style={{ color: 'var(--cp-error)' }}>
                Letzte Mail an die Familie ist nicht angekommen.
              </p>
              <ActionForm
                action={resendMail}
                label="Mail erneut senden"
                pendingLabel="Wird gesendet …"
                variant="primary"
                brandStrong={brandStrong}
                brandOn={brandOn}
              />
            </>
          ) : registration.email_sent_at ? (
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
              Mail an die Familie gesendet.
            </p>
          ) : null}
        </div>

        {isOpenPayment(registration) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={markPaid} label={de.paymentsPage.markPaid} pendingLabel={de.paymentsPage.updating} variant={editing ? 'secondary' : 'primary'} brandStrong={brandStrong} brandOn={brandOn} />
            <ActionForm action={markWaived} label={de.paymentsPage.markWaived} pendingLabel={de.paymentsPage.updating} variant="secondary" requireConfirm={de.paymentsPage.waivedConfirm} />
          </div>
        )}
        {canReopenPayment(registration) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {registration.payment_status === 'paid' && (
              <ActionForm action={markRefunded} label={de.paymentsPage.markRefunded} pendingLabel={de.paymentsPage.updating} variant="danger" requireConfirm="Wirklich erstatten?" />
            )}
            <ActionForm action={markOpen} label={de.paymentsPage.markOpen} pendingLabel={de.paymentsPage.updating} variant="secondary" requireConfirm={de.paymentsPage.markOpenConfirm} />
          </div>
        )}

      </div>
      {registration.status !== 'cancelled' && (
        <section className="md:col-span-2 border-t pt-5" style={{ borderColor: 'var(--cp-line-2)' }} aria-label="Anmeldung stornieren">
          <ActionForm
            action={cancel}
            onResult={reportResult}
            label="Anmeldung stornieren"
            pendingLabel="Wird storniert …"
            variant="danger"
            cancelLabel="Behalten"
            requireConfirm={<>
              <p className="cp-subheading">Anmeldung von {childName} für {campTitle} stornieren?</p>
              <p>Zahlungsstatus: {paymentStatusLabel[registration.payment_status] ?? registration.payment_status}</p>
              <p>Ein frei werdender Platz geht automatisch an die nächste Anmeldung auf der Warteliste. Eine Rückzahlung wird dadurch nicht ausgeführt.</p>
            </>}
          />
        </section>
      )}
    </div>
  )
}
