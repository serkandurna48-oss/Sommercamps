'use client'

import { useState } from 'react'
import { de, formatDateRange, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { isActiveRegistration, isOpenPayment } from '../commandCenterLogic'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import type { ActionFormState } from '../ui/ActionForm'
import Button, { ButtonLink } from '../ui/Button'
import ListRow from '../ui/ListRow'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import RowOverflow from '../ui/RowOverflow'
import PaymentTextCopy, { PaymentTextFallback } from './PaymentTextCopy'
import { buildPaymentReminder, reminderLabels, type ReminderOrganization } from '../../../lib/zahlungserinnerung'

export default function PaymentRow({
  registration,
  camp,
  org,
  orgSlug,
  onPaid,
  brandStrong,
  brandOn,
}: {
  registration: RegistrationAdmin
  camp: CampAdmin
  org: ReminderOrganization
  orgSlug: string
  onPaid: () => void
  brandStrong: string
  brandOn: string
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

  return (
    <div className="cp-ledger-row cp-mobile-card border-t" data-status={registration.payment_status} style={{ borderTopColor: 'var(--cp-line-2)' }}>
      <ListRow className="cp-list-row-padded" main={<div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold" style={{ color: 'var(--cp-ink)' }}>{registration.payment_reference}</span>
          <Button className="cp-desktop-only" type="button" variant="secondary" aria-label={`Verwendungszweck ${registration.payment_reference} kopieren`} onClick={copyReference}>
            {copyState === 'copied' ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
        {copyState === 'error' && <p role="alert">Kopieren nicht möglich – bitte den Verwendungszweck auswählen und kopieren.</p>}
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          <span className="cp-child-name">{registration.child_first_name} {registration.child_last_name}</span><span className="cp-desktop-only"> · {camp.title}</span>
          <span className="cp-mobile-only cp-camp-date">{camp.title} · {formatDateRange(camp.start_date, camp.end_date)}</span>
        </p>

      </div>} secondary={        <p className="cp-chip mt-0.5 truncate" style={{ color: 'var(--cp-muted)' }}>
          {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
        </p>} status={<div className="flex flex-col items-start gap-2">
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
        </div>} action={<div className="cp-mobile-actions">        {isOpenPayment(registration) && (
          <div className="cp-payment-actions flex flex-wrap items-center gap-2">
            <ActionForm
              action={markPaid}
              label={de.paymentsPage.markPaid}
              pendingLabel={de.paymentsPage.updating}
              variant="primary"
              brandStrong={brandStrong}
              brandOn={brandOn}
            />
            <RowOverflow label={`Weitere Aktionen für ${registration.child_first_name} ${registration.child_last_name}`}>
            <Button className="cp-mobile-only" type="button" onClick={copyReference}>{copyState === 'copied' ? 'Kopiert' : 'Verwendungszweck kopieren'}</Button>
            <PaymentTextCopy text={reminder} label={reminderLabels.copy}
              onFallback={setFallbackText}
              disabledReason={reminder === null ? reminderLabels.missingIban : undefined} />
            <ActionForm
              action={markWaived}
              label={de.paymentsPage.markWaived}
              pendingLabel={de.paymentsPage.updating}
              variant="danger"
              requireConfirm="Wirklich erlassen?"
            />
            </RowOverflow>
          </div>
        )}

        {!isOpenPayment(registration) && <>
          <ButtonLink className="cp-mobile-only" href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>Anmeldungen ansehen</ButtonLink>
          <RowOverflow label={`Weitere Aktionen für ${registration.child_first_name} ${registration.child_last_name}`}>
          <Button className="cp-mobile-only" type="button" onClick={copyReference}>{copyState === 'copied' ? 'Kopiert' : 'Verwendungszweck kopieren'}</Button>
        {registration.payment_status === 'paid' && (
          <ActionForm
            action={markRefunded}
            label={de.paymentsPage.markRefunded}
            pendingLabel={de.paymentsPage.updating}
            variant="danger"
            requireConfirm="Bereits erfolgte Rückzahlung als erstattet markieren? CampsPilot überweist kein Geld."
          />
        )}
          </RowOverflow>
        </>}
        </div>} />
      {isOpenPayment(registration) && fallbackText && fallbackText === reminder && (
        <div className="cp-list-row-padded"><PaymentTextFallback text={fallbackText} /></div>
      )}
    </div>
  )
}
