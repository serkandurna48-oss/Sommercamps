import type { ClubMember } from '../../../lib/saasAdminApi'
import { formatDateDE } from '../../../lib/formatDate'
import { setMemberActiveAction } from '../actions/trainingActions'
import StatusChip from '../data/StatusChip'
import ActionForm from '../ui/ActionForm'

/** Eine Zeile der Mitgliederliste. Zeigt Kinderdaten: nie loggen oder an Analytics senden. */
export default function MemberRow({ orgSlug, member }: { orgSlug: string; member: ClubMember }) {
  const toggle = setMemberActiveAction.bind(null, orgSlug, member.id, !member.active)
  return (
    <li className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderTopColor: 'var(--cp-line-2)' }} data-active={member.active}>
      <div className="min-w-0 flex-1">
        <p className="cp-subheading break-words" style={{ color: 'var(--cp-ink)' }}>{member.first_name} {member.last_name}</p>
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          geboren {formatDateDE(member.birth_date)}{member.member_number ? ` · Nr. ${member.member_number}` : ''} · {member.source === 'csv' ? 'per CSV' : 'manuell'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={member.active ? 'ok' : 'neutral'} label={member.active ? 'Aktiv' : 'Inaktiv'} />
        <ActionForm action={toggle} label={member.active ? 'Auf inaktiv setzen' : 'Auf aktiv setzen'} pendingLabel="Wird gespeichert …"
          requireConfirm={member.active ? 'Mitglied auf inaktiv setzen? Es bekommt dann nicht mehr den Mitgliederpreis.' : undefined} />
      </div>
    </li>
  )
}
