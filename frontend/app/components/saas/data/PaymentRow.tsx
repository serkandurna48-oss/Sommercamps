'use client'

import { useId, useState } from 'react'
import { de, formatDate, formatDateRange, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import { isActiveRegistration, isOpenPayment, canReopenPayment, registrationPriceCents } from '../commandCenterLogic'
import type { PaymentRegistration } from '../commandCenterLogic'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm from '../ui/ActionForm'
import type { ActionFormState } from '../ui/ActionForm'
import Button, { ButtonLink } from '../ui/Button'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import { IconChevronDown } from '../icons'
import { paymentMethodLabel } from '../training/trainingLogic'
import PaymentTextCopy, { PaymentTextFallback } from './PaymentTextCopy'
import { buildPaymentReminder, reminderLabels, type ReminderOrganization } from '../../../lib/zahlungserinnerung'

export default function PaymentRow({
  registration,
  camp,
  org,
  orgSlug,
  expanded,
  onToggle,
  onPaid,
  memberPrices = true,
}: {
  registration: PaymentRegistration
  camp: CampAdmin
  org: ReminderOrganization
  orgSlug: string
  expanded: boolean
  onToggle: () => void
  onPaid: () => void
  /** Members module on: show the member/non-member price label. */
  memberPrices?: boolean
}) {
  const detailId = useId()
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

  // Collapsed: child, camp/training + date, amount, status, one primary action.
  // Everything else lives in the inline details below; one row is open at a time.
  const isTraining = camp.organization_id === ''
  const when = isTraining ? camp.title : `${camp.title} · ${formatDateRange(camp.start_date, camp.end_date)}`
  const priceCents = registrationPriceCents(camp, registration)
  const memberLabel = !memberPrices ? null : registration.member_match === true ? 'Mitgliederpreis' : registration.member_match === false ? 'Nichtmitgliederpreis' : null

  function onRowClick(event: React.MouseEvent<HTMLDivElement>) {
    // Clicks on buttons, links and forms keep their own meaning.
    if ((event.target as HTMLElement).closest('button, a, form, input, textarea, [role="alert"]')) return
    onToggle()
  }

  return (
    <div className="cp-ledger-row cp-mobile-card cp-pay-row" data-status={registration.payment_status} data-expanded={expanded || undefined} onClick={onRowClick}>
      <div className="cp-pay-who min-w-0">
        <Button type="button" className="cp-pay-toggle" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
          aria-label={`${childName}, Details ${expanded ? 'schließen' : 'anzeigen'}`} onClick={onToggle}
          onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); onToggle() } }}>
          <IconChevronDown className={`cp-pay-chevron shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          <span className="min-w-0">
            <span className="cp-label cp-child-name block" style={{ color: 'var(--cp-ink)' }}>{childName}</span>
            <span className="cp-hint cp-camp-date block" title={when}>{when}</span>
          </span>
        </Button>
      </div>
      <span className="cp-pay-amount cp-num cp-label" style={{ color: 'var(--cp-ink)' }}>
        {formatEuro(priceCents, camp.currency)}
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
      </div>
      {expanded && (
        <div id={detailId} role="region" aria-label={`Details zu ${childName}`} className="cp-pay-details"
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onToggle() } }}>
          <dl className="cp-pay-facts">
            <div>
              <dt>Verwendungszweck</dt>
              <dd className="cp-pay-ref">
                <span className="cp-code" style={{ color: 'var(--cp-ink)' }}>{registration.payment_reference}</span>
                <Button className="cp-pay-copy" type="button" variant="secondary" aria-label={`Verwendungszweck ${registration.payment_reference} kopieren`} onClick={copyReference}>
                  {copyState === 'copied' ? 'Kopiert' : 'Kopieren'}
                </Button>
                {copyState === 'error' && <span role="alert" className="cp-hint">Kopieren nicht möglich – bitte den Verwendungszweck auswählen und kopieren.</span>}
              </dd>
            </div>
            <div>
              <dt>Eltern</dt>
              <dd>{registration.parent_first_name} {registration.parent_last_name}<br />{registration.parent_email}</dd>
            </div>
            <div>
              <dt>Zahlart</dt>
              <dd>{registration.payment_method ? paymentMethodLabel(registration.payment_method) : '–'}</dd>
            </div>
            <div>
              <dt>Angemeldet am</dt>
              <dd><time dateTime={registration.created_at}>{formatDate(registration.created_at)}</time></dd>
            </div>
            {memberLabel && (
              <div>
                <dt>Preis</dt>
                <dd>{memberLabel} · {formatEuro(priceCents, camp.currency)}</dd>
              </div>
            )}
          </dl>
          <div className="cp-pay-more">
            {open && (
              <PaymentTextCopy text={reminder} label={reminderLabels.copy}
                onFallback={setFallbackText}
                disabledReason={reminder === null ? reminderLabels.missingIban : undefined} />
            )}
            {open && (
              <ActionForm
                action={markWaived}
                label={de.paymentsPage.markWaived}
                pendingLabel={de.paymentsPage.updating}
                variant="secondary"
                requireConfirm={de.paymentsPage.waivedConfirm}
              />
            )}
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
            {!isTraining && <ButtonLink href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>Zu den Anmeldungen</ButtonLink>}
          </div>
          {open && fallbackText && fallbackText === reminder && <PaymentTextFallback text={fallbackText} />}
        </div>
      )}
    </div>
  )
}
