'use client'

import { useState } from 'react'
import { de, formatEuro, paymentStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'
import StatusChip, { PAYMENT_STATUS_TONE } from './StatusChip'

export default function PaymentRow({
  registration,
  camp,
  orgSlug,
  showCampTitle = false,
}: {
  registration: RegistrationAdmin
  camp: CampAdmin
  orgSlug: string
  showCampTitle?: boolean
}) {
  const [confirmWaive, setConfirmWaive] = useState(false)
  const [confirmRefund, setConfirmRefund] = useState(false)

  const markPaid = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'paid', de.paymentsPage.markPaidSuccess)
  const markWaived = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'waived', de.paymentsPage.markWaivedSuccess)
  const markRefunded = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'refunded', de.paymentsPage.markRefundedSuccess)

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

      <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end md:gap-1.5">
        <div className="flex items-center gap-3">
          <span className="cp-num cp-subheading shrink-0" style={{ color: 'var(--cp-ink)' }}>
            {formatEuro(camp.price_cents, camp.currency)}
          </span>
          <StatusChip
            tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'}
            label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status}
          />
        </div>

        {registration.payment_status === 'open' && (
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm
              action={markPaid}
              label={de.paymentsPage.markPaid}
              pendingLabel={de.paymentsPage.updating}
              variant="secondary"
            />
            {confirmWaive ? (
              <div className="flex items-center gap-2">
                <ActionForm
                  action={markWaived}
                  label={de.paymentsPage.markWaived}
                  pendingLabel={de.paymentsPage.updating}
                  variant="quiet"
                />
                <Button type="button" variant="quiet" onClick={() => setConfirmWaive(false)}>
                  Abbrechen
                </Button>
              </div>
            ) : (
              <Button type="button" variant="quiet" onClick={() => setConfirmWaive(true)}>
                {de.paymentsPage.markWaived}
              </Button>
            )}
          </div>
        )}

        {registration.payment_status === 'paid' && (
          confirmRefund ? (
            <div className="flex items-center gap-2">
              <ActionForm
                action={markRefunded}
                label={de.paymentsPage.markRefunded}
                pendingLabel={de.paymentsPage.updating}
                variant="quiet"
              />
              <Button type="button" variant="quiet" onClick={() => setConfirmRefund(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button type="button" variant="quiet" onClick={() => setConfirmRefund(true)}>
              {de.paymentsPage.markRefunded}
            </Button>
          )
        )}
      </div>
    </div>
  )
}
