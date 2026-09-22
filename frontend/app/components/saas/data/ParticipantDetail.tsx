import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { hasMissingEmergencyContact, hasNotes } from '../commandCenterLogic'
import Button from '../ui/Button'

/**
 * Inline-Detail (Abschnitt 4.3) — kein Dialog, wächst an Ort und Stelle
 * (M3, gesteuert vom Elternteil ParticipantRow über .cp-collapse).
 * "Nächster Schritt" bietet nur Aktionen, die wirklich funktionieren
 * (mailto:/tel:) — keine Buttons für Zahlungsbestätigung oder
 * Warteliste-Verschieben, dafür existiert kein Endpunkt (Akzeptanzkriterium
 * "kein Element suggeriert eine nicht existierende Funktion").
 */
export default function ParticipantDetail({ registration }: { registration: RegistrationAdmin }) {
  const missingContact = hasMissingEmergencyContact(registration)
  const notes = hasNotes(registration)

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
      </div>
    </div>
  )
}
