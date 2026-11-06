'use client'

import { useId, useState } from 'react'
import type { ClubMember } from '../../../lib/saasAdminApi'
import EmptyState from '../state/EmptyState'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import ExtraFieldRemove from './ExtraFieldRemove'
import MemberRow from './MemberRow'
import { filterMembers, memberExtraLabels, type MemberStatusFilter } from './trainingLogic'

/** Mitgliederliste mit Suche im Browser. Der Suchbegriff bleibt im
 * Komponentenzustand (nicht in der URL, kein Request). */
export default function MemberList({ orgSlug, members }: { orgSlug: string; members: ClubMember[] }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<MemberStatusFilter>('alle')
  const filtered = q.trim() !== '' || status !== 'alle'
  const shown = filterMembers(members, q, status)
  const extraLabels = memberExtraLabels(members)
  // Extra columns widen the grid; the container scrolls horizontally on desktop.
  const gridStyle = extraLabels.length > 0
    ? { gridTemplateColumns: `minmax(160px, 1.6fr) 140px minmax(120px, 1fr) 88px ${extraLabels.map(() => 'minmax(120px, 1fr)').join(' ')} 180px` }
    : undefined
  const tableStyle = extraLabels.length > 0 ? { '--cp-member-min': `${760 + extraLabels.length * 136}px` } as React.CSSProperties : undefined

  return (
    <>
      <div role="search" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Field label={extraLabels.length > 0 ? 'Suche nach Name, Nummer oder Zusatzfeld' : 'Suche nach Name oder Mitgliedsnummer'} htmlFor={`${id}-q`}>
            <input id={`${id}-q`} type="search" value={q} onChange={event => setQ(event.target.value)} maxLength={100} autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
        </div>
        <div className="sm:w-44">
          <Field label="Status" htmlFor={`${id}-status`}>
            <select id={`${id}-status`} value={status} onChange={event => setStatus(event.target.value as MemberStatusFilter)} className={INPUT_CLASS} style={INPUT_STYLE}>
              <option value="alle">Alle</option>
              <option value="aktiv">Nur aktive</option>
              <option value="inaktiv">Nur inaktive</option>
            </select>
          </Field>
        </div>
        {filtered && <Button type="button" onClick={() => { setQ(''); setStatus('alle') }}>Zurücksetzen</Button>}
      </div>
      {extraLabels.length > 0 && (
        // Phones have no table head: same remove controls as a compact list.
        <div className="cp-chip mb-3 flex flex-wrap gap-x-4 gap-y-2 lg:hidden" data-extra-fields-mobile style={{ color: 'var(--cp-ink-2)' }}>
          <span style={{ color: 'var(--cp-muted)' }}>Zusatzfelder:</span>
          {extraLabels.map(label => <ExtraFieldRemove key={label} orgSlug={orgSlug} label={label} />)}
        </div>
      )}
      <p className="cp-chip mb-2" role="status" style={{ color: 'var(--cp-muted)' }}>
        {filtered ? `${shown.length} von ${members.length} Mitgliedern` : `${members.length} Mitglieder`}
      </p>
      {shown.length === 0 ? (
        <EmptyState title={filtered ? 'Keine Mitglieder gefunden.' : 'Noch keine Mitglieder.'}
          body={filtered ? 'Passen Sie Suche oder Status an.' : 'Importieren Sie Ihre Mitgliederliste per CSV oder tragen Sie Mitglieder einzeln ein.'} />
      ) : (
        <div className={extraLabels.length > 0 ? 'cp-card cp-member-scroll' : undefined}>
          <ul className={extraLabels.length > 0 ? 'cp-card-list cp-table cp-member-wide' : 'cp-card cp-card-list cp-table'} style={tableStyle}>
            {/* Head stays visual-only, except the remove controls of extra fields (desktop). */}
            <li className="cp-table-head cp-member-cols" aria-hidden={extraLabels.length === 0 ? true : undefined} style={gridStyle}>
              <span aria-hidden="true">Name</span><span aria-hidden="true">Geburtsdatum</span>
              <span aria-hidden="true">Nummer · Quelle</span><span aria-hidden="true">Status</span>
              {extraLabels.map(label => <ExtraFieldRemove key={label} orgSlug={orgSlug} label={label} />)}
              <span aria-hidden="true" />
            </li>
            {shown.map(member => <MemberRow key={member.id} orgSlug={orgSlug} member={member} extraLabels={extraLabels} gridStyle={gridStyle} />)}
          </ul>
        </div>
      )}
    </>
  )
}
