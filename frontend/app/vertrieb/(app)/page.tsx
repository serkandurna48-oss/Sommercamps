import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PAGE } from '../../components/saas/ui/pageLayout'
import { fetchSalesLeads, fetchSalesMe, type LeadStatus } from '../../lib/saasAdminApi'
import { getValidAccessToken } from '../../lib/supabaseServer'
import { dueLabel, isOpen, KIND_LABEL, STATUS_LABEL, STATUS_ORDER, todayBerlin } from '../labels'

type View = 'mine' | 'all' | 'unassigned'
const VIEW_LABEL: Record<View, string> = { all: 'Alle', mine: 'Meine', unassigned: 'Nicht verteilt' }

function chipStyle(active: boolean) {
  return active
    ? { background: 'var(--cp-ink)', color: 'var(--cp-surface)', borderColor: 'var(--cp-ink)' }
    : { borderColor: 'var(--cp-line)', color: 'var(--cp-ink)' }
}

function href(params: Record<string, string | undefined>) {
  // owner filter (from the team page) is kept by callers that pass it explicitly
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))
  return q.size ? `/vertrieb?${q}` : '/vertrieb'
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')
  const me = await fetchSalesMe(token)
  if (!me) redirect('/platform')

  const params = await searchParams
  const views: View[] = me.role === 'owner' ? ['all', 'unassigned'] : me.can_manage ? ['all', 'mine', 'unassigned'] : ['mine']
  const view: View = views.includes(params.ansicht as View) ? (params.ansicht as View) : views[0]
  const status = STATUS_ORDER.includes(params.status as LeadStatus) ? (params.status as LeadStatus) : undefined
  const showClosed = params.erledigt === '1'

  const owner = me.can_manage && view === 'all' && /^[0-9a-f-]{36}$/i.test(params.owner ?? '') ? params.owner : undefined
  const leads = await fetchSalesLeads(token, { view, status, ownerUserId: owner, openOnly: !status && !showClosed })
  const today = todayBerlin()
  const overdue = leads.filter(l => isOpen(l.status) && l.next_action_at && l.next_action_at < today).length

  return (
    <main className={PAGE}>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="cp-title" style={{ color: 'var(--cp-ink)' }}>
          {me.can_manage ? 'Leads' : 'Meine Leads'}
        </h1>
        <Link href="/vertrieb/neu" className="cp-focus cp-btn cp-btn-primary inline-flex min-h-[44px] items-center px-4">
          Neuer Lead
        </Link>
      </div>
      <p className="cp-body mb-5" style={{ color: 'var(--cp-muted)' }}>
        {leads.length} {leads.length === 1 ? 'Lead' : 'Leads'}
        {overdue > 0 && <> · <strong style={{ color: 'var(--cp-error)' }}>{overdue} überfällig</strong></>}
        {owner && leads[0]?.owner_name && <> · nur {leads[0].owner_name} (<Link className="cp-focus underline" href={href({ ansicht: 'all' })}>alle zeigen</Link>)</>}
        {' '}· sortiert nach nächstem Schritt
      </p>

      {views.length > 1 && (
        <nav aria-label="Ansicht" className="mb-3 flex flex-wrap gap-2">
          {views.map(v => (
            <Link key={v} href={href({ ansicht: v, status, erledigt: showClosed ? '1' : undefined })} aria-current={v === view ? 'page' : undefined}
              className="cp-focus cp-chip inline-flex min-h-11 items-center rounded-[var(--cp-r-chip)] border px-4" style={chipStyle(v === view)}>
              {VIEW_LABEL[v]}
            </Link>
          ))}
        </nav>
      )}
      <nav aria-label="Status" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <Link href={href({ ansicht: view, owner })} aria-current={!status && !showClosed ? 'page' : undefined}
          className="cp-focus cp-chip inline-flex min-h-11 shrink-0 items-center rounded-[var(--cp-r-chip)] border px-3" style={chipStyle(!status && !showClosed)}>
          Offen
        </Link>
        {STATUS_ORDER.map(s => (
          <Link key={s} href={href({ ansicht: view, status: s, owner })} aria-current={s === status ? 'page' : undefined}
            className="cp-focus cp-chip inline-flex min-h-11 shrink-0 items-center rounded-[var(--cp-r-chip)] border px-3" style={chipStyle(s === status)}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
        <Link href={href({ ansicht: view, erledigt: '1', owner })} aria-current={showClosed && !status ? 'page' : undefined}
          className="cp-focus cp-chip inline-flex min-h-11 shrink-0 items-center rounded-[var(--cp-r-chip)] border px-3" style={chipStyle(showClosed && !status)}>
          Alle
        </Link>
      </nav>

      {leads.length === 0 ? (
        <p className="cp-body rounded-[var(--cp-r-card)] border px-4 py-8 text-center" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}>
          {me.can_manage ? 'Keine Leads in dieser Ansicht.' : 'Dir sind noch keine Leads zugeordnet. Lege selbst einen an oder frag die Vertriebsleitung.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {leads.map(lead => {
            const due = isOpen(lead.status) ? dueLabel(lead.next_action_at, today) : null
            return (
              <li key={lead.id}>
                <Link href={`/vertrieb/${lead.id}`} className="cp-focus block rounded-[var(--cp-r-card)] border px-4 py-3"
                  style={{ borderColor: due?.overdue ? 'var(--cp-error)' : 'var(--cp-line)', background: 'var(--cp-surface)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="cp-subheading min-w-0 break-words" style={{ color: 'var(--cp-ink)' }}>
                      {lead.name}
                      {lead.fit && <span className="cp-chip ml-2" style={{ color: 'var(--cp-muted)' }}>{lead.fit}</span>}
                    </p>
                    <span className="cp-chip rounded-[var(--cp-r-chip)] border px-2 py-0.5" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-ink)' }}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </div>
                  <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
                    {[KIND_LABEL[lead.kind], lead.city, me.can_manage ? lead.owner_name ?? 'nicht verteilt' : null].filter(Boolean).join(' · ')}
                  </p>
                  {due && (
                    <p className="cp-chip mt-1" style={{ color: due.overdue ? 'var(--cp-error)' : 'var(--cp-ink)' }}>
                      Nächster Schritt: {due.text}
                    </p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
