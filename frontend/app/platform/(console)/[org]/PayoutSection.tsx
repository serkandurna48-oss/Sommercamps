import Button from '../../../components/saas/ui/Button'
import type { PayoutMonth } from '../../../lib/saasAdminApi'
import PayoutMarkForm from './PayoutMarkForm'
import { defaultPayoutReference, euro, germanDate, payoutSummary } from './payoutFormat'

/** Owner console: what you still owe the club for payments CampsPilot collected. */
export default function PayoutSection({ orgSlug, monthKey, payouts, today }: {
  orgSlug: string
  monthKey: string
  payouts: PayoutMonth | null
  today: string
}) {
  return (
    <section className="mt-8" aria-labelledby="payout-heading" data-testid="payouts">
      <h2 id="payout-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Auszahlungen</h2>
      <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Zahlungen, die CampsPilot für diesen Verein eingezogen hat. Du überweist dem Verein den Betrag abzüglich Plattformgebühr und Erstattungen
          und markierst den Monat danach als überwiesen. Der Monat ist der Zahlungsmonat (Europe/Berlin).
        </p>
        <form method="get" className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="payout_month" className="cp-body">Monat</label>
          <input id="payout_month" name="payout_month" type="month" defaultValue={monthKey} min="2000-01" required className="cp-body rounded border px-2 py-1" style={{ borderColor: 'var(--cp-line)' }} />
          <Button type="submit">Anzeigen</Button>
        </form>
        {!payouts ? (
          <p className="cp-body mt-3" style={{ color: 'var(--cp-ink-2)' }}>Auszahlungen nicht abrufbar.</p>
        ) : payouts.bookings.length === 0 ? (
          <p className="cp-body mt-3" style={{ color: 'var(--cp-ink-2)' }} data-testid="payout-empty">Keine Plattform-Zahlungen in {monthKey}.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="cp-body w-full text-left">
                <caption className="sr-only">Buchungen {monthKey}</caption>
                <thead>
                  <tr style={{ color: 'var(--cp-muted)' }}>
                    <th className="py-1 pr-3 font-normal">Datum</th>
                    <th className="py-1 pr-3 font-normal">Camp</th>
                    <th className="py-1 pr-3 text-right font-normal">Betrag</th>
                    <th className="py-1 pr-3 text-right font-normal">Gebühr</th>
                    <th className="py-1 text-right font-normal">Erstattung</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.bookings.map((b, i) => (
                    <tr key={`${b.date}-${i}`} style={{ borderTop: '1px solid var(--cp-line)' }}>
                      <td className="py-1 pr-3">{germanDate(b.date)}</td>
                      <td className="py-1 pr-3">{b.camp_title}</td>
                      <td className="py-1 pr-3 text-right">{euro(b.amount_cents)}</td>
                      <td className="py-1 pr-3 text-right">{euro(b.fee_cents)}</td>
                      <td className="py-1 text-right">{b.refund_cents ? euro(b.refund_cents) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="cp-body mt-3 grid max-w-[480px] grid-cols-[1fr_auto] gap-x-6 gap-y-1">
              {payoutSummary(payouts).map(row => {
                const total = row.label === 'An den Verein zu überweisen'
                return (
                  <div key={row.label} className="contents">
                    <dt style={{ color: total ? 'var(--cp-ink)' : 'var(--cp-ink-2)' }}>{row.label}</dt>
                    <dd className={total ? 'text-right font-semibold' : 'text-right'} data-testid={total ? 'payout-total' : undefined}>{row.value}</dd>
                  </div>
                )
              })}
            </dl>
            <p className="cp-body mt-3" data-testid="payout-iban" style={{ color: 'var(--cp-ink)' }}>
              IBAN des Vereins: {payouts.iban ?? 'nicht hinterlegt (Verein: Einstellungen → Bankverbindung)'}
            </p>
            {payouts.payout ? (
              <p className="cp-body mt-3" role="status" data-testid="payout-done" style={{ color: 'var(--cp-ok)' }}>
                Als überwiesen markiert: {euro(payouts.payout.payout_cents)} am {germanDate(payouts.payout.paid_at)} · {payouts.payout.reference}
                {payouts.changed_since_paid ? ' · Achtung: Seit der Überweisung hat sich der Betrag durch eine Erstattung geändert.' : ''}
              </p>
            ) : payouts.payout_cents > 0 ? (
              <PayoutMarkForm orgSlug={orgSlug} month={monthKey} today={today} reference={defaultPayoutReference(monthKey)} />
            ) : (
              <p className="cp-body mt-3" style={{ color: 'var(--cp-ink-2)' }}>Es gibt nichts zu überweisen.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
