import Link from '../preview/AdminLink'
import { formatDateDE } from '../../../lib/formatDate'
import { hasModule } from '../../../lib/orgModules'
import { setMemberActiveAction } from '../actions/trainingActions'
import StatusChip from '../data/StatusChip'
import PageHeader from '../shell/PageHeader'
import ActionForm from '../ui/ActionForm'
import { ADMIN_PAGE } from '../ui/pageLayout'
import type { OrganizationIdentityProps } from './types'
import type { ClubMemberDetail } from '../../../lib/saasAdminApi'

/** Alle Daten eines Mitglieds, inklusive jedes importierten Zusatzfelds mit seiner Bezeichnung.
 * Enthält Daten von Kindern: nie loggen oder an Analytics senden. */
export default function MemberDetailScreen({ orgSlug, org, member }: OrganizationIdentityProps & { member: ClubMemberDetail }) {
  const toggle = setMemberActiveAction.bind(null, orgSlug, member.id, !member.active)
  const extraEntries = Object.entries(member.extra ?? {})
  const rows: Array<[string, string]> = [
    ['Vorname', member.first_name],
    ['Nachname', member.last_name],
    ['Geburtsdatum', formatDateDE(member.birth_date)],
    ['Mitgliedsnummer', member.member_number || '–'],
    ['Herkunft', member.source === 'csv' ? 'Per CSV importiert' : 'Manuell angelegt'],
    ['Angelegt am', formatDateDE(member.created_at.slice(0, 10))],
    ['Zuletzt geändert', formatDateDE(member.updated_at.slice(0, 10))],
  ]

  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/mitglieder`}
        backLabel="Alle Mitglieder"
        title={`${member.first_name} ${member.last_name}`}
        subtitle={<StatusChip tone={member.active ? 'ok' : 'neutral'} label={member.active ? 'Aktiv' : 'Inaktiv'} />}
      />
      <main className={ADMIN_PAGE}>
        <div className="flex flex-col gap-6">
          <section className="cp-card" aria-labelledby="member-data-heading" data-member-data>
            <h2 id="member-data-heading" className="cp-subheading mb-3">Mitgliederdaten</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{label}</dt>
                  <dd className="cp-body break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="cp-card" aria-labelledby="member-extra-heading" data-member-extra>
            <h2 id="member-extra-heading" className="cp-subheading mb-3">Zusatzfelder</h2>
            {extraEntries.length === 0 ? (
              <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Für dieses Mitglied sind keine Zusatzfelder gespeichert. Zusatzfelder kommen aus deinem CSV-Import.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {extraEntries.map(([label, value]) => (
                  <div key={label} data-extra={label}>
                    <dt className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{label}</dt>
                    <dd className="cp-body break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {hasModule(org, 'players') && (
            <section className="cp-card" aria-labelledby="member-player-heading" data-member-player>
              <h2 id="member-player-heading" className="cp-subheading mb-3">Spielerakte</h2>
              {member.player ? (
                <p className="cp-body">
                  <Link href={`/pilot/${orgSlug}/spieler/${member.player.id}`} className="underline" style={{ color: 'var(--cp-ink)' }}>
                    Spielerakte von {member.player.first_name} {member.player.last_name} öffnen
                  </Link>
                </p>
              ) : (
                <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Zu diesem Mitglied gibt es noch keine Spielerakte. Sie entsteht bei der ersten Trainingsbuchung.</p>
              )}
            </section>
          )}

          <section className="cp-card" aria-labelledby="member-status-heading">
            <h2 id="member-status-heading" className="cp-subheading mb-3">Status ändern</h2>
            <p className="cp-body mb-3" style={{ color: 'var(--cp-ink-2)' }}>Aktive Mitglieder bekommen beim Training den Mitgliederpreis.</p>
            <ActionForm action={toggle} label={member.active ? 'Auf inaktiv setzen' : 'Auf aktiv setzen'} pendingLabel="Wird gespeichert …"
              requireConfirm={member.active ? 'Mitglied auf inaktiv setzen? Es bekommt dann nicht mehr den Mitgliederpreis.' : undefined} />
          </section>
        </div>
      </main>
    </>
  )
}
