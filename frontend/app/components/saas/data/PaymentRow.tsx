'use client'

import { useState } from 'react'
import { de, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { isActiveRegistration, isOpenPayment } from '../commandCenterLogic'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import type { ActionFormState } from '../ui/ActionForm'
import Button from '../ui/Button'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'

export default function PaymentRow({
  registration,
  camp,
  orgSlug,
  onPaid,
}: {
  registration: RegistrationAdmin
  camp: CampAdmin
  orgSlug: string
  onPaid: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  async function markPaid(previous: ActionFormState) {
    const result = await setPaymentStatusAction(orgSlug, camp.slug, registration.registration_token, 'paid', de.paymentsPage.markPaidSuccess, previous)
    if (result.success && !result.error) onPaid()
    return result
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(registration.payment_reference)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }
  const markWaived = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'waived', de.paymentsPage.markWaivedSuccess)
  const markRefunded = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'refunded', de.paymentsPage.markRefundedSuccess)

  return (
    <div
      className="cp-ledger-row flex flex-col gap-3 border-t px-5 py-3.5 md:flex-row md:items-center md:justify-between md:gap-4"
      data-status={registration.payment_status}
      style={{ borderTopColor: 'var(--cp-line-2)' }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold" style={{ color: 'var(--cp-ink)' }}>{registration.payment_reference}</span>
          <Button type="button" variant="quiet" aria-label={`Verwendungszweck ${registration.payment_reference} kopieren`} onClick={copyReference}>
            {copyState === 'copied' ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
        {copyState === 'error' && <p role="alert">Kopieren nicht möglich – bitte den Verwendungszweck auswählen und kopieren.</p>}
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {registration.child_first_name} {registration.child_last_name} · {camp.title}
        </p>
        <p className="cp-chip mt-0.5 truncate" style={{ color: 'var(--cp-muted)' }}>
          {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end md:gap-1.5">
        <div className="flex items-center gap-3">
          <span className="cp-num cp-subheading shrink-0" style={{ color: 'var(--cp-ink)' }}>
            {formatEuro(camp.price_cents, camp.currency)}
          </span>
          <StatusChip
            tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'}
            label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status}
          />
          {!isActiveRegistration(registration) && (
            <StatusChip
              tone={REGISTRATION_STATUS_TONE[registration.status] ?? 'neutral'}
              label={registrationStatusLabel[registration.status] ?? registration.status}
              dot
            />
          )}
        </div>

        {isOpenPayment(registration) && (
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm
              action={markPaid}
              label={de.paymentsPage.markPaid}
              pendingLabel={de.paymentsPage.updating}
              variant="secondary"
            />
            <ActionForm
              action={markWaived}
              label={de.paymentsPage.markWaived}
              pendingLabel={de.paymentsPage.updating}
              variant="quiet-danger"
              requireConfirm="Wirklich erlassen?"
            />
          </div>
        )}

        {registration.payment_status === 'paid' && (
          <ActionForm
            action={markRefunded}
            label={de.paymentsPage.markRefunded}
            pendingLabel={de.paymentsPage.updating}
            variant="quiet-danger"
            requireConfirm="Bereits erfolgte Rückzahlung als erstattet markieren? CampsPilot überweist kein Geld."
          />
        )}
      </div>
    </div>
  )
}
