import type { FeeMonth, FeeRule, StripePaymentStatus } from '../../../lib/saasAdminApi'

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', verein: 'Verein', individuell: 'Individuell' }
const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/** "Individuell · 5,00 % + 0,25 € · mind. 1,00 €" */
export function formatFeeRule(rule: Pick<FeeRule, 'plan' | 'percent' | 'fixed_cents' | 'min_fee_cents' | 'monthly_fee_cents'>): string {
  const parts = [`${PLAN_LABEL[rule.plan] ?? rule.plan} · ${Number(rule.percent).toFixed(2).replace('.', ',')} %`]
  if (rule.fixed_cents) parts[0] += ` + ${euro(rule.fixed_cents)}`
  if (rule.min_fee_cents) parts.push(`mind. ${euro(rule.min_fee_cents)}`)
  if (typeof rule.monthly_fee_cents === 'number') parts.push(`Grundgebühr ${euro(rule.monthly_fee_cents)} / Monat`)
  return parts.join(' · ')
}

/** Rows of the monthly overview: booking fees (net of refunds), base fee, total. */
export function feeMonthSummary(month: Pick<FeeMonth, 'monthly_fee_cents' | 'total_cents'>): Array<{ label: string; value: string }> {
  return [
    { label: 'Buchungsgebühren (abzüglich Erstattungen)', value: euro(month.total_cents - month.monthly_fee_cents) },
    { label: 'Grundgebühr', value: euro(month.monthly_fee_cents) },
    { label: 'Summe', value: euro(month.total_cents) },
  ]
}

/** `?month=` is used only as YYYY-MM (2000 onward); anything else falls back to the running month. */
export function resolveFeeMonth(requested: string | string[] | undefined, current: string): string {
  return typeof requested === 'string' && /^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current
}

export function formatStripeStatus(status: StripePaymentStatus | null): string {
  if (!status) return 'Status nicht abrufbar'
  const express = {
    not_set_up: 'Stripe-Konto nicht eingerichtet', incomplete: 'Stripe-Konto: Angaben fehlen',
    awaiting_approval: 'Stripe-Konto bereit, wartet auf Freigabe', active: 'Stripe-Konto aktiv',
  }[status.state]
  const legacy = status.legacy_account_linked ? (status.legacy_active ? ' · Altkonto (Direct Charges) aktiv' : ' · Altkonto verbunden, inaktiv') : ''
  const mode = status.online_payment_mode === 'direct_fee'
    ? ' · Direct Charge mit Plattformgebühr (Managed Risk)'
    : status.online_payment_mode === 'destination'
      ? ' · Zahlungen über die Plattform (Express)'
      : status.online_payment_mode === 'direct' ? ' · Zahlungen direkt beim Verein (ohne Gebühr)' : ' · keine Online-Zahlung'
  const switched = status.platform_enabled ? '' : ' · Online-Zahlung gesperrt'
  return `${express}${legacy}${mode}${switched}${status.service_ready ? '' : ' · Umgebung nicht freigeschaltet'}`
}
