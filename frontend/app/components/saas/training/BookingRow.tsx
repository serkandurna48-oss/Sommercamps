import { de, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction } from '../actions/waitlistActions'
import { setPaymentStatusAction } from '../actions/paymentActions'
import { canReopenPayment, isActiveRegistration, isOpenPayment } from '../commandCenterLogic'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from '../data/StatusChip'
import ActionForm from '../ui/ActionForm'
import { paymentMethodLabel } from './trainingLogic'

/** Eine Buchung eines Trainingstermins. Zahlstatus wird über denselben Weg
 * gesetzt wie in den Camp-Zahlungen; die Route nimmt den Termin-Slug. Bei
 * Barzahlung markiert der Admin die Zahlung nach Erhalt selbst als bezahlt. */
export default function BookingRow({ orgSlug, sessionSlug, registration, brandStrong, brandOn }: {
  orgSlug: string
  sessionSlug: string
  registration: RegistrationAdmin
  brandStrong: string
  brandOn: string
}) {
  const token = registration.registration_token
  const markPaid = setPaymentStatusAction.bind(null, orgSlug, sessionSlug, token, 'paid', de.paymentsPage.markPaidSuccess)
  const markOpen = setPaymentStatusAction.bind(null, orgSlug, sessionSlug, token, 'open', de.paymentsPage.markOpenSuccess)
  const cancel = cancelRegistrationAction.bind(null, orgSlug, sessionSlug, token)
  const active = isActiveRegistration(registration)
  const memberLabel = registration.member_match === true ? 'Mitglied' : registration.member_match === false ? 'Nichtmitglied' : null

  return (
    <li className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-start sm:justify-between" style={{ borderTopColor: 'var(--cp-line-2)' }} data-payment-status={registration.payment_status}>
      <div className="min-w-0 flex-1">
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{registration.child_first_name} {registration.child_last_name}</p>
        <p className="cp-chip break-words" style={{ color: 'var(--cp-muted)' }}>
          {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email} · {registration.parent_phone}
        </p>
        <p className="cp-chip mt-1" style={{ color: 'var(--cp-ink-2)' }}>
          {registration.applied_price_cents != null ? formatEuro(registration.applied_price_cents) : '–'}
          {memberLabel ? ` · ${memberLabel}` : ''} · Zahlart: {paymentMethodLabel(registration.payment_method)}
        </p>
        {registration.payment_method === 'bar' && isOpenPayment(registration) && (
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>Barzahlung vor Ort: nach Erhalt als bezahlt markieren.</p>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'} label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status} />
          {!active && <StatusChip tone={REGISTRATION_STATUS_TONE[registration.status] ?? 'neutral'} label={registrationStatusLabel[registration.status] ?? registration.status} dot />}
        </div>
        {isOpenPayment(registration) && (
          <ActionForm action={markPaid} label={de.paymentsPage.markPaid} pendingLabel={de.paymentsPage.updating} variant="primary" brandStrong={brandStrong} brandOn={brandOn} />
        )}
        {canReopenPayment(registration) && (
          <ActionForm action={markOpen} label={de.paymentsPage.markOpen} pendingLabel={de.paymentsPage.updating} requireConfirm={de.paymentsPage.markOpenConfirm} />
        )}
        {active && (
          <ActionForm action={cancel} label="Buchung stornieren" pendingLabel="Wird storniert …" variant="danger"
            requireConfirm="Buchung wirklich stornieren? Der Platz wird wieder frei." />
        )}
      </div>
    </li>
  )
}
