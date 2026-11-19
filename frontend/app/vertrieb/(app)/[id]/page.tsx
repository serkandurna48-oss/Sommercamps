import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PAGE } from '../../../components/saas/ui/pageLayout'
import { fetchSalesAssignees, fetchSalesLead, fetchSalesMe } from '../../../lib/saasAdminApi'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { dueLabel, isOpen, KIND_LABEL, STATUS_LABEL, todayBerlin } from '../../labels'
import { AssignForm, MasterDataForm, NextStepForm } from '../LeadForms'

function statusChange(body: string | null): string {
  return (body ?? '').split(' → ').map(part => STATUS_LABEL[part as keyof typeof STATUS_LABEL] ?? part).join(' → ')
}

const CARD = 'rounded-[var(--cp-r-card)] border px-4 py-4'
const CARD_STYLE = { borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')
  const me = await fetchSalesMe(token)
  if (!me) redirect('/platform')
  const { id } = await params
  const lead = await fetchSalesLead(token, id)
  if (!lead) notFound()
  const members = me.can_manage ? await fetchSalesAssignees(token) : []
  const due = isOpen(lead.status) ? dueLabel(lead.next_action_at, todayBerlin()) : null

  return (
    <main className={PAGE}>
      <Link href="/vertrieb" className="cp-focus cp-chip mb-3 inline-flex min-h-11 items-center" style={{ color: 'var(--cp-muted)' }}>
        ← Zurück zur Liste
      </Link>
      <h1 className="cp-title break-words" style={{ color: 'var(--cp-ink)' }}>{lead.name}</h1>
      <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
        {[STATUS_LABEL[lead.status], KIND_LABEL[lead.kind], lead.city, lead.fit && `Passung ${lead.fit}`,
          me.can_manage && (lead.owner_name ? `zuständig: ${lead.owner_name}` : 'nicht verteilt')].filter(Boolean).join(' · ')}
        {due && <><br /><span style={{ color: due.overdue ? 'var(--cp-error)' : 'var(--cp-ink)' }}>Nächster Schritt: {due.text}</span></>}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <section className={CARD} style={CARD_STYLE} aria-labelledby="kontakt">
            <h2 id="kontakt" className="cp-heading mb-2" style={{ color: 'var(--cp-ink)' }}>Kontakt</h2>
            <ul className="cp-body flex flex-col gap-1" style={{ color: 'var(--cp-ink)' }}>
              {lead.contact_name && <li>{lead.contact_name}</li>}
              {lead.phone && <li><a className="cp-focus underline" href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a></li>}
              {lead.email && <li><a className="cp-focus break-all underline" href={`mailto:${lead.email}`}>{lead.email}</a></li>}
              {lead.website && <li><a className="cp-focus break-all underline" href={lead.website} target="_blank" rel="noopener noreferrer">{lead.website}</a></li>}
              {lead.source_url && <li className="cp-chip"><a className="cp-focus break-all underline" href={lead.source_url} target="_blank" rel="noopener noreferrer">Quelle</a></li>}
              {!lead.contact_name && !lead.phone && !lead.email && !lead.website && (
                <li style={{ color: 'var(--cp-muted)' }}>Noch keine Kontaktdaten. Unten unter „Stammdaten“ ergänzen.</li>
              )}
            </ul>
          </section>

          <section className={CARD} style={CARD_STYLE} aria-labelledby="schritt">
            <h2 id="schritt" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Nach dem Gespräch</h2>
            <NextStepForm lead={lead} />
          </section>

          {me.can_manage && (
            <section className={CARD} style={CARD_STYLE} aria-labelledby="zuweisung">
              <h2 id="zuweisung" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Zuweisung</h2>
              <AssignForm lead={lead} members={members} />
            </section>
          )}

          <details className={CARD} style={CARD_STYLE}>
            <summary className="cp-focus cp-heading min-h-11 cursor-pointer" style={{ color: 'var(--cp-ink)' }}>Stammdaten bearbeiten</summary>
            <div className="mt-3"><MasterDataForm lead={lead} /></div>
          </details>
        </div>

        <section className={CARD} style={CARD_STYLE} aria-labelledby="verlauf">
          <h2 id="verlauf" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Verlauf</h2>
          {lead.activities.length === 0 ? (
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Noch nichts passiert.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {lead.activities.map(a => (
                <li key={a.id}>
                  <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                    {new Date(a.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}
                    {' · '}{a.actor_name ?? 'Plattform'}
                  </p>
                  <p className="cp-body whitespace-pre-wrap break-words" style={{ color: 'var(--cp-ink)' }}>
                    {a.kind === 'status' ? `Status: ${statusChange(a.body)}` : a.kind === 'angelegt' ? `Angelegt${a.body ? `: ${a.body}` : ''}` : a.body}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  )
}
