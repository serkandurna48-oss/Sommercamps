import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import { PAGE } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import MemberCreateForm from '../training/MemberCreateForm'
import MemberList from '../training/MemberList'
import MemberImport from '../training/MemberImport'
import type { OrganizationIdentityProps } from './types'
import type { ClubMember } from '../../../lib/saasAdminApi'

export default function MembersScreen({ orgSlug, org, members }: OrganizationIdentityProps & { members: ClubMember[] }) {
  const brand = computeBrandTokens(org.primary_color)
  const activeCount = members.filter(member => member.active).length

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Mitglieder"
        metrics={[{ label: 'Mitglieder', value: String(members.length) }, { label: 'Davon aktiv', value: String(activeCount) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE}>
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Vereinsmitglieder</h2>
        <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
          Wer hier als aktiv geführt ist, bekommt beim Training den Mitgliederpreis. Der Abgleich läuft über Name und Geburtsdatum.
          Die Liste enthält Daten von Kindern: bitte nicht weitergeben.
        </p>

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MemberImport orgSlug={orgSlug} />
          <MemberCreateForm orgSlug={orgSlug} />
        </div>

        <MemberList orgSlug={orgSlug} members={members} />
      </main>
    </>
  )
}
