'use client'

import { useState } from 'react'
import { de, formatDateRange, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import { isActiveRegistration, isOpenPayment, canReopenPayment, registrationPriceCents } from '../commandCenterLogic'
import type { PaymentRegistration } from '../commandCenterLogic'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import type { ActionFormState } from '../ui/ActionForm'
import Button, { ButtonLink } from '../ui/Button'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import RowOverflow from '../ui/RowOverflow'
import { paymentMethodLabel } from '../training/trainingLogic'
import PaymentTextCopy, { PaymentTextFallback } from './PaymentTextCopy'
import { buildPaymentReminder, reminderLabels, type ReminderOrganization } from '../../../lib/zahlungserinnerung'

export default function PaymentRow({
  registration,
  camp,
  org,
  orgSlug,
  onPaid,
}: {
  registration: PaymentRegistration
  camp: CampAdmin
  org: ReminderOrganization
  orgSlug: string
  onPaid: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const reminder = buildPaymentReminder({ registration, camp }, org)
  const [fallbackText, setFallbackText] = useState<string | null>(null)
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
  const markOpen = setPaymentStatusAction.bind(null, orgSlug, camp.slug, registration.registration_token, 'open', de.paymentsPage.markOpenSuccess)

  const childName = `${registration.child_first_name} ${registration.child_last_name}`
  const open = isOpenPayment(registration)
  const reopen = canReopenPayment(registration)
  const refundable = registration.payment_status === 'paid'
  const copyLabel = copyState === 'copied' ? 'Kopiert' : 'Verwendungszweck kopieren'

  // Compact ledger row: one table row on desktop (>= 1024 px), a card on phones.
  // Exactly one visible action (mark as paid) for open payments; everything else sits in "Mehr".
  return (
    <div className="cp-ledger-row cp-mobile-card cp-pay-row" data-status={registration.payment_status}>
      <div className="cp-pay-who min-w-0">
        <p className="cp-label cp-child-name truncate" style={{ color: 'var(--cp-ink)' }}>{childName}</p>
        <p className="cp-hint truncate">
          {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
          {registration.payment_method ? ` · Zahlart: ${paymentMethodLabel(registration.payment_method)}` : ''}
        </p>
        <p className="cp-hint truncate cp-desktop-only" title={camp.title}>{camp.title}</p>
        <p className="cp-mobile-only cp-camp-date">{camp.title} · {formatDateRange(camp.start_date, camp.end_date)}</p>
      </div>
      <div className="cp-pay-ref min-w-0">
        <span className="cp-code" style={{ color: 'var(--cp-ink)' }}>{registration.payment_reference}</span>
        <Button className="cp-desktop-only cp-pay-copy" type="button" variant="secondary" aria-label={`Verwendungszweck ${registration.payment_reference} kopieren`} onClick={copyReference}>
          {copyState === 'copied' ? 'Kopiert' : 'Kopieren'}
        </Button>
        {copyState === 'error' && <p role="alert" className="cp-hint">Kopieren nicht möglich – bitte den Verwendungszweck auswählen und kopieren.</p>}
      </div>
      <span className="cp-pay-amount cp-num cp-label" style={{ color: 'var(--cp-ink)' }}>
        {formatEuro(registrationPriceCents(camp, registration), camp.currency)}
      </span>
      <div className="cp-row-status cp-pay-status">
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
      <div className="cp-pay-action">
        {open && (
          <ActionForm
            action={markPaid}
            label={de.paymentsPage.markPaid}
            pendingLabel={de.paymentsPage.updating}
            variant="secondary"
          />
        )}
        {!open && <ButtonLink className="cp-mobile-only" href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>Anmeldungen ansehen</ButtonLink>}
        {open || refundable || reopen ? (
          <RowOverflow menu label={`Mehr Aktionen für ${childName}`}>
            <Button className="cp-mobile-only" type="button" onClick={copyReference}>{copyLabel}</Button>
            {open && <>
              <PaymentTextCopy text={reminder} label={reminderLabels.copy}
                onFallback={setFallbackText}
                disabledReason={reminder === null ? reminderLabels.missingIban : undefined} />
              <ActionForm
                action={markWaived}
                label={de.paymentsPage.markWaived}
                pendingLabel={de.paymentsPage.updating}
                variant="secondary"
                requireConfirm={de.paymentsPage.waivedConfirm}
              />
            </>}
            {refundable && (
              <ActionForm
                action={markRefunded}
                label={de.paymentsPage.markRefunded}
                pendingLabel={de.paymentsPage.updating}
                variant="danger"
                requireConfirm="Bereits erfolgte Rückzahlung als erstattet markieren? CampsPilot überweist kein Geld."
              />
            )}
            {reopen && (
              <ActionForm
                action={markOpen}
                label={de.paymentsPage.markOpen}
                pendingLabel={de.paymentsPage.updating}
                variant="secondary"
                requireConfirm={de.paymentsPage.markOpenConfirm}
              />
            )}
          </RowOverflow>
        ) : (
          <Button className="cp-mobile-only" type="button" onClick={copyReference}>{copyLabel}</Button>
        )}
      </div>
      {open && fallbackText && fallbackText === reminder && (
        <div className="cp-pay-fallback"><PaymentTextFallback text={fallbackText} /></div>
      )}
    </div>
  )
}
