'use client'

import { useId, useState } from 'react'
import type { ClubMember } from '../../../lib/saasAdminApi'
import EmptyState from '../state/EmptyState'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import MemberRow from './MemberRow'
import { filterMembers, type MemberStatusFilter } from './trainingLogic'

/** Mitgliederliste mit Suche im Browser. Der Suchbegriff bleibt im
 * Komponentenzustand (nicht in der URL, kein Request). */
export default function MemberList({ orgSlug, members }: { orgSlug: string; members: ClubMember[] }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<MemberStatusFilter>('alle')
  const filtered = q.trim() !== '' || status !== 'alle'
  const shown = filterMembers(members, q, status)

  return (
    <>
      <div role="search" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Field label="Suche nach Name oder Mitgliedsnummer" htmlFor={`${id}-q`}>
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
      <p className="cp-chip mb-2" role="status" style={{ color: 'var(--cp-muted)' }}>
        {filtered ? `${shown.length} von ${members.length} Mitgliedern` : `${members.length} Mitglieder`}
      </p>
      {shown.length === 0 ? (
        <EmptyState title={filtered ? 'Keine Mitglieder gefunden.' : 'Noch keine Mitglieder.'}
          body={filtered ? 'Passen Sie Suche oder Status an.' : 'Importieren Sie Ihre Mitgliederliste per CSV oder tragen Sie Mitglieder einzeln ein.'} />
      ) : (
        <ul className="cp-card cp-card-list cp-table">
          <li className="cp-table-head cp-member-cols" aria-hidden="true">
            <span>Name</span><span>Geburtsdatum</span><span>Nummer · Quelle</span><span>Status</span><span />
          </li>
          {shown.map(member => <MemberRow key={member.id} orgSlug={orgSlug} member={member} />)}
        </ul>
      )}
    </>
  )
}
