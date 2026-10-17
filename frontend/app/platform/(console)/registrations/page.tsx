import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchGlobalRegistrationsAdmin, type GlobalRegistration } from '../../../lib/saasAdminApi'

const STATUS_LABEL: Record<string, string> = {
  registered: 'Angemeldet',
  confirmed: 'Bestätigt',
  waitlist: 'Warteliste',
  cancelled: 'Storniert',
}

const PAYMENT_LABEL: Record<string, string> = {
  open: 'Offen',
  paid: 'Bezahlt',
  refunded: 'Erstattet',
  waived: 'Erlassen',
  cancelled: 'Storniert',
}

/** CEO-Konsole: Anmeldungen über alle Vereine hinweg, filterbar per
 * Query-Parameter (?verein=&camp=&status=) — bewusst serverseitig
 * gefiltert (GET /admin/registrations, owner-only), nicht clientseitig
 * über die volle Liste, da diese plattformweit potenziell groß wird. */
export default async function GlobalRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ verein?: string; camp?: string; status?: string }>
}) {
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const { verein, camp, status } = await searchParams
  const registrations = await fetchGlobalRegistrationsAdmin(token, {
    organizationSlug: verein,
    campSlug: camp,
    status: status as GlobalRegistration['status'] | undefined,
  })

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
        Anmeldungen
      </h1>
      <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
        {registrations.length === 0
          ? 'Keine Anmeldungen gefunden.'
          : `${registrations.length} Anmeldung${registrations.length === 1 ? '' : 'en'}${
              verein || camp || status ? ' (gefiltert)' : ''
            } — neueste zuerst, max. 500.`}
      </p>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <input
          type="text"
          name="verein"
          defaultValue={verein}
          placeholder="Verein-Slug"
          className="cp-body rounded-[var(--cp-r-field)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)' }}
        />
        <input
          type="text"
          name="camp"
          defaultValue={camp}
          placeholder="Camp-Slug"
          className="cp-body rounded-[var(--cp-r-field)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)' }}
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="cp-body rounded-[var(--cp-r-field)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)' }}
        >
          <option value="">Alle Status</option>
          <option value="registered">Angemeldet</option>
          <option value="confirmed">Bestätigt</option>
          <option value="waitlist">Warteliste</option>
          <option value="cancelled">Storniert</option>
        </select>
        <button
          type="submit"
          className="cp-chip rounded-[var(--cp-r-chip)] border px-4 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          Filtern
        </button>
      </form>

      {registrations.length === 0 ? (
        <p className="cp-body rounded-[var(--cp-r-card)] border px-4 py-8 text-center" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}>
          Keine Anmeldungen für diese Filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)' }}>
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="cp-chip border-b" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}>
                <th className="px-4 py-3">Verein</th>
                <th className="px-4 py-3">Camp</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Zahlung</th>
                <th className="px-4 py-3">Angemeldet am</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map(r => (
                <tr key={r.id} className="cp-body border-b last:border-0" style={{ borderColor: 'var(--cp-line)' }}>
                  <td className="px-4 py-3">
                    <Link href={`/platform/${r.organization_slug}`} className="underline">
                      {r.organization_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.camp_title}</td>
                  <td className="px-4 py-3">
                    {r.child_first_name} {r.child_last_name}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-3">{PAYMENT_LABEL[r.payment_status] ?? r.payment_status}</td>
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
