import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction } from '../actions/waitlistActions'
import { hasMissingEmergencyContact, hasNotes } from '../commandCenterLogic'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'

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
}: {
  registration: RegistrationAdmin
  orgSlug: string
  campSlug: string
}) {
  const missingContact = hasMissingEmergencyContact(registration)
  const notes = hasNotes(registration)
  const cancel = cancelRegistrationAction.bind(null, orgSlug, campSlug, registration.registration_token)

  return (
    <div className="grid grid-cols-1 gap-6 border-t px-5 py-5 md:grid-cols-2" style={{ borderColor: 'var(--cp-line-2)' }}>
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
