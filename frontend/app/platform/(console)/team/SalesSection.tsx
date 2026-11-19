'use client'

import { useActionState } from 'react'
import type { SalesMember } from '../../../lib/saasAdminApi'
import { INPUT_CLASS, INPUT_STYLE } from '../../../components/saas/ui/formFieldStyles'
import { addSalesMemberAction, updateSalesMemberAction } from './salesActions'
import type { TeamActionState } from './teamActions'

const initial: TeamActionState = { error: null, notice: null }
const BTN = 'cp-focus cp-chip inline-flex min-h-11 items-center justify-center rounded-[var(--cp-r-chip)] border px-4 disabled:opacity-50'
const ROLE = { sales_lead: 'Vertriebsleitung', sales_rep: 'Vertrieb' } as const

function Feedback({ state }: { state: TeamActionState }) {
  if (state.error) return <p className="cp-chip mt-2" role="alert" style={{ color: 'var(--cp-error)' }}>{state.error}</p>
  if (state.notice) return <p className="cp-chip mt-2" role="status" style={{ color: 'var(--cp-ink)' }}>{state.notice}</p>
  return null
}

function MemberRow({ member, first }: { member: SalesMember; first: boolean }) {
  const [state, action, pending] = useActionState(updateSalesMemberAction, initial)
  const other = member.role === 'sales_lead' ? 'sales_rep' : 'sales_lead'
  return (
    <li className="px-4 py-3" style={first ? undefined : { borderTop: '1px solid var(--cp-line)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="cp-body break-all" style={{ color: 'var(--cp-ink)' }}>
            {member.display_name}
            {!member.active && <span className="cp-chip ml-2" style={{ color: 'var(--cp-muted)' }}>(deaktiviert)</span>}
          </p>
          <p className="cp-chip mt-1 break-all" style={{ color: 'var(--cp-muted)' }}>
            {ROLE[member.role]} · {member.email ?? member.user_id} · nur Vertrieb, kein Zugriff auf Vereine
          </p>
        </div>
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="user_id" value={member.user_id} />
          <input type="hidden" name="role" value={other} />
          {member.active && (
            <button type="submit" name="change" value="role" disabled={pending} className={BTN} style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}>
              {other === 'sales_lead' ? 'Zur Vertriebsleitung' : 'Zum Vertrieb'}
            </button>
          )}
          <button type="submit" name="change" value={member.active ? 'deactivate' : 'activate'} disabled={pending} className={BTN}
            style={{ borderColor: 'var(--cp-field-line)', color: member.active ? 'var(--cp-error)' : 'var(--cp-ink)' }}>
            {member.active ? 'Deaktivieren' : 'Aktivieren'}
          </button>
        </form>
      </div>
      <Feedback state={state} />
    </li>
  )
}

/** Vertriebskonten: nur Plattform-Owner (Backend prüft). Deaktivierte Konten
 * verlieren sofort den Zugang; ihre Leads bleiben zugeordnet, bis die
 * Vertriebsleitung sie umverteilt. */
export default function SalesSection({ members }: { members: SalesMember[] | null }) {
  const [state, action, pending] = useActionState(addSalesMemberAction, initial)
  return (
    <section className="mt-10">
      <h2 className="cp-heading mb-1" style={{ color: 'var(--cp-ink)' }}>Vertrieb ({members?.filter(m => m.active).length ?? 0})</h2>
      <p className="cp-chip mb-3 max-w-[640px]" style={{ color: 'var(--cp-muted)' }}>
        Vertriebler sehen nach dem Login nur ihre eigenen Leads, die Vertriebsleitung alle Leads und das Team. Keiner von beiden sieht Vereine oder Anmeldungen.
      </p>
      {members === null ? (
        <p className="cp-body mb-3 rounded-[var(--cp-r-card)] border px-4 py-4" role="alert" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-error)' }}>
          Vertriebskonten konnten nicht geladen werden. Ist die Migration „sales_crm“ in dieser Umgebung schon ausgeführt?
        </p>
      ) : members.length > 0 && (
        <ul className="mb-4 rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {members.map((m, i) => <MemberRow key={m.user_id} member={m} first={i === 0} />)}
        </ul>
      )}
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <label className="sr-only" htmlFor="sales-name">Name</label>
        <input id="sales-name" name="display_name" required maxLength={80} placeholder="Name" className={INPUT_CLASS} style={INPUT_STYLE} />
        <label className="sr-only" htmlFor="sales-email">E-Mail-Adresse</label>
        <input id="sales-email" name="email" type="email" required autoComplete="off" placeholder="name@beispiel.de" className={INPUT_CLASS} style={INPUT_STYLE} />
        <label className="sr-only" htmlFor="sales-role">Rolle</label>
        <select id="sales-role" name="role" defaultValue="sales_rep" className={INPUT_CLASS} style={INPUT_STYLE}>
          <option value="sales_rep">Vertrieb</option>
          <option value="sales_lead">Vertriebsleitung</option>
        </select>
        <button type="submit" disabled={pending} className={BTN} style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}>
          {pending ? 'Wird eingeladen …' : 'Einladen'}
        </button>
      </form>
      <Feedback state={state} />
    </section>
  )
}
