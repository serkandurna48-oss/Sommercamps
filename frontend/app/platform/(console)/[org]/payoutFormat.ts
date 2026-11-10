import type { PayoutMonth } from '../../../lib/saasAdminApi'

export const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/** "2026-12-15" -> "15.12.2026" */
export const germanDate = (iso: string) => iso.split('-').reverse().join('.')

/** Standard transfer reference proposed to the owner. */
export const defaultPayoutReference = (month: string) => `CampsPilot Auszahlung ${month.slice(5)}/${month.slice(0, 4)}`

/** Rows under the table: paid, refunded, fee, and the amount to transfer. */
export function payoutSummary(p: Pick<PayoutMonth, 'paid_cents' | 'refunded_cents' | 'fee_cents' | 'payout_cents'>): Array<{ label: string; value: string }> {
  return [
    { label: 'Eingezogen', value: euro(p.paid_cents) },
    { label: 'Erstattet', value: `− ${euro(p.refunded_cents)}` },
    { label: 'Plattformgebühr (nach Erstattungen)', value: `− ${euro(p.fee_cents)}` },
    // Refunds can exceed the month's payments: the rest is settled with the next month.
    { label: p.payout_cents < 0 ? 'Verrechnung mit Folgemonat' : 'An den Verein zu überweisen', value: euro(p.payout_cents) },
  ]
}
