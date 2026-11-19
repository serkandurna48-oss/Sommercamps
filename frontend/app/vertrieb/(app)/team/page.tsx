import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PAGE } from '../../../components/saas/ui/pageLayout'
import { fetchSalesMe, fetchSalesTeam } from '../../../lib/saasAdminApi'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { ROLE_LABEL, STATUS_LABEL, STATUS_ORDER } from '../../labels'

/** Vertriebsleitung + Plattform: wer arbeitet woran, wo hängt es. */
export default async function SalesTeamPage() {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')
  const me = await fetchSalesMe(token)
  if (!me) redirect('/platform')
  if (!me.can_manage) redirect('/vertrieb')
  const team = await fetchSalesTeam(token)
  const total = STATUS_ORDER.reduce((sum, s) => sum + (team.funnel[s] ?? 0), 0)

  return (
    <main className={PAGE}>
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Team</h1>
      <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
        {total} Leads gesamt
        {team.unassigned_open > 0 && <> · <Link className="cp-focus underline" href="/vertrieb?ansicht=unassigned">{team.unassigned_open} offen und nicht verteilt</Link></>}
      </p>

      <section aria-labelledby="trichter" className="mb-8">
        <h2 id="trichter" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Trichter</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {STATUS_ORDER.map(s => (
            <li key={s} className="rounded-[var(--cp-r-card)] border px-3 py-2" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
              <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{STATUS_LABEL[s]}</p>
              <p className="cp-heading" style={{ color: 'var(--cp-ink)' }}>{team.funnel[s] ?? 0}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="personen">
        <h2 id="personen" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Personen</h2>
        {team.members.length === 0 ? (
          <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Noch keine Vertriebskonten. Anlegen unter Plattform → Team.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {team.members.map(m => (
              <li key={m.user_id} className="rounded-[var(--cp-r-card)] border px-4 py-3" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)', opacity: m.active ? 1 : 0.6 }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
                    {m.display_name}
                    <span className="cp-chip ml-2" style={{ color: 'var(--cp-muted)' }}>{ROLE_LABEL[m.role]}{m.active ? '' : ' · deaktiviert'}</span>
                  </p>
                  <Link className="cp-focus cp-chip inline-flex min-h-11 items-center underline" href={`/vertrieb?ansicht=all&owner=${m.user_id}`}>
                    Leads ansehen
                  </Link>
                </div>
                <p className="cp-chip mt-1" style={{ color: 'var(--cp-ink)' }}>
                  {m.open} offen · {m.won} gewonnen · {m.total} gesamt
                  {m.overdue > 0 && <span style={{ color: 'var(--cp-error)' }}> · {m.overdue} überfällig</span>}
                </p>
                <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
                  {STATUS_ORDER.filter(s => m.by_status[s]).map(s => `${STATUS_LABEL[s]} ${m.by_status[s]}`).join(' · ') || 'keine Leads'}
                  {' · '}zuletzt aktiv: {m.last_activity_at ? new Date(m.last_activity_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : 'noch nie'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
