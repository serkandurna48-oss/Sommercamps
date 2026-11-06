import type { InvoiceList as InvoiceListData } from '../../../lib/saasAdminApi'
import { formatDate, formatEuro as euro } from '../../../lib/i18n/de'
import PendingInvoicesNotice from './PendingInvoicesNotice'


function status(sentAt: string | null, sendError: string | null): string {
  if (sentAt) return 'Gesendet'
  return sendError ? 'Versand fehlgeschlagen' : 'Nicht gesendet'
}

/** Zahlungen → Rechnungen: every invoice and storno of the club. */
export default function InvoiceList({ orgSlug, data }: { orgSlug: string; data: InvoiceListData | null }) {
  return (
    <section id="rechnungen" aria-labelledby="rechnungen-heading" className="mt-10 scroll-mt-24">
      <h2 id="rechnungen-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Rechnungen</h2>
      {data === null ? (
        <p role="alert" className="cp-body">Rechnungen konnten nicht geladen werden.</p>
      ) : (
        <>
          <PendingInvoicesNotice orgSlug={orgSlug} open={data.open} profileComplete={data.billing_profile_complete} />
          {data.invoices.length === 0 ? (
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
              Noch keine Rechnungen. Sie entstehen automatisch, sobald eine Buchung bezahlt ist.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
              <table className="cp-body w-full text-left">
                <thead>
                  <tr style={{ color: 'var(--cp-muted)' }}>
                    <th className="px-3 py-2 font-normal">Nummer</th>
                    <th className="px-3 py-2 font-normal">Datum</th>
                    <th className="px-3 py-2 font-normal">Empfänger</th>
                    <th className="px-3 py-2 font-normal">Betrag</th>
                    <th className="px-3 py-2 font-normal">Status</th>
                    <th className="px-3 py-2 font-normal"><span className="sr-only">PDF</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map(invoice => (
                    <tr key={invoice.id} style={{ borderTop: '1px solid var(--cp-line)' }}>
                      <td className="px-3 py-2">
                        {invoice.number}
                        {invoice.kind === 'storno' && <span className="cp-chip ml-2" style={{ color: 'var(--cp-muted)' }}>Storno zu {invoice.cancels_number}</span>}
                      </td>
                      <td className="px-3 py-2">{formatDate(invoice.issue_date)}</td>
                      <td className="px-3 py-2">{invoice.recipient_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{euro(invoice.gross_cents)}</td>
                      <td className="px-3 py-2" style={{ color: invoice.send_error && !invoice.sent_at ? 'var(--cp-error)' : undefined }}>
                        {status(invoice.sent_at, invoice.send_error)}
                      </td>
                      <td className="px-3 py-2"><a className="underline" href={`/pilot/${orgSlug}/rechnungen/${invoice.id}`} download>PDF</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
