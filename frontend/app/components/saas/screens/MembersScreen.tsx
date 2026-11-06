import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import MemberCreateForm from '../training/MemberCreateForm'
import MemberList from '../training/MemberList'
import MemberImport from '../training/MemberImport'
import type { OrganizationIdentityProps } from './types'
import type { ClubMember } from '../../../lib/saasAdminApi'

export default function MembersScreen({ orgSlug, members }: OrganizationIdentityProps & { members: ClubMember[] }) {
  const activeCount = members.filter(member => member.active).length

  return (
    <>
      <PageHeader
        title="Mitglieder"
        subtitle="Aktive Mitglieder bekommen beim Training den Mitgliederpreis (Abgleich über Name und Geburtsdatum). Enthält Daten von Kindern: bitte nicht weitergeben."
        metrics={[{ label: 'Mitglieder', value: String(members.length) }, { label: 'Davon aktiv', value: String(activeCount) }]}
      />

      <main className={ADMIN_PAGE}>
        <div className="cp-split-wide">
          <section aria-labelledby="members-list-heading" className="min-w-0">
            <h2 id="members-list-heading" className="sr-only">Vereinsmitglieder</h2>
            <MemberList orgSlug={orgSlug} members={members} />
          </section>
          <div className="cp-split-side">
            <MemberCreateForm orgSlug={orgSlug} />
            <MemberImport orgSlug={orgSlug} />
          </div>
        </div>
      </main>
    </>
  )
}
