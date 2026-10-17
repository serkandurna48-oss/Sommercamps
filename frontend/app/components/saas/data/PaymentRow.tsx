import { de, formatEuro, paymentStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import StatusChip, { PAYMENT_STATUS_TONE } from './StatusChip'

/**
 * Eine Zahlungszeile mit den einzigen sinnvollen nächsten Schritten für
 * ihren aktuellen Status — nie alle fünf Werte als Auswahl (ein "erlassen"
 * -Button auf einer schon erstatteten Zahlung wäre eine Aktion ohne
 * plausiblen Anwendungsfall). `cancelled` ist nirgends als Ziel wählbar —
 * das ist ein Folgezustand einer stornierten Anmeldung, kein manueller
 * Buchungsschritt (siehe backend_saas update_payment_status-Docstring).
 */
export default function PaymentRow({
  registration,
  camp,
  orgSlug,
  brandStrong,
  brandOn,
  showCampTitle = false,
}: {
  registration: RegistrationAdmin
  camp: CampAdmin
  orgSlug: string
  brandStrong: string
  brandOn: string
  showCampTitle?: boolean
}) {
  const markPaid = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'paid', de.paymentsPage.markPaidSuccess)
  const markWaived = setPaymentStatusAction.bind(
    null,
    orgSlug,
    camp.slug,
    registration.registration_token,
    'waived',
    de.paymentsPage.markWaivedSuccess,
  )
  const markRefunded = setPaymentStatusAction.bind(
    null,
    orgSlug,
    camp.slug,
    registration.registration_token,
    'refunded',
    de.paymentsPage.markRefundedSuccess,
  )

  return (
    <div
      className="cp-ledger-row flex flex-col gap-3 border-t px-5 py-3.5 md:flex-row md:items-center md:justify-between md:gap-4"
      data-status={registration.payment_status}
      style={{ borderTopColor: 'var(--cp-line-2)' }}
    >
      <div className="min-w-0">
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {registration.child_first_name} {registration.child_last_name}
        </p>
        <p className="cp-chip mt-0.5 truncate" style={{ color: 'var(--cp-muted)' }}>
          {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
        </p>
        {showCampTitle && (
          <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-ink-2)' }}>
            {camp.title}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 md:flex-col md:items-end md:gap-1.5">
        <div className="flex items-center gap-3">
          <span className="cp-num cp-heading shrink-0" style={{ color: 'var(--cp-ink)' }}>
            {formatEuro(camp.price_cents, camp.currency)}
          </span>
          <StatusChip
            tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'}
            label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status}
          />
        </div>
        {registration.payment_status === 'open' && (
          <div className="flex flex-wrap gap-2">
            <ActionForm
              action={markPaid}
              label={de.paymentsPage.markPaid}
              pendingLabel={de.paymentsPage.updating}
              variant="primary"
              brandStrong={brandStrong}
              brandOn={brandOn}
            />
            <ActionForm action={markWaived} label={de.paymentsPage.markWaived} pendingLabel={de.paymentsPage.updating} variant="secondary" />
          </div>
        )}
        {registration.payment_status === 'paid' && (
          <ActionForm action={markRefunded} label={de.paymentsPage.markRefunded} pendingLabel={de.paymentsPage.updating} variant="secondary" />
        )}
      </div>
    </div>
  )
}
