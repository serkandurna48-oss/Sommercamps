import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import EmptyState from '../state/EmptyState'
import Button, { ButtonLink } from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { PAGE } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import MemberCreateForm from '../training/MemberCreateForm'
import MemberImport from '../training/MemberImport'
import MemberRow from '../training/MemberRow'
import type { MemberStatusFilter } from '../trainingAdminData'
import type { OrganizationIdentityProps } from './types'
import type { ClubMember } from '../../../lib/saasAdminApi'

export default function MembersScreen({ orgSlug, org, members, q, status }: OrganizationIdentityProps & {
  members: ClubMember[]
  q: string
  status: MemberStatusFilter
}) {
  const brand = computeBrandTokens(org.primary_color)
  const filtered = q !== '' || status !== 'alle'
  const activeCount = members.filter(member => member.active).length

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Mitglieder"
        metrics={[{ label: filtered ? 'Treffer' : 'Mitglieder', value: String(members.length) }, { label: 'Davon aktiv', value: String(activeCount) }]}
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
          <MemberImport orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
          <MemberCreateForm orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
        </div>

        <form method="get" role="search" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <Field label="Suche nach Name oder Mitgliedsnummer" htmlFor="member_q">
              <input id="member_q" name="q" type="search" defaultValue={q} maxLength={100} autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
            </Field>
          </div>
          <div className="sm:w-44">
            <Field label="Status" htmlFor="member_status">
              <select id="member_status" name="status" defaultValue={status} className={INPUT_CLASS} style={INPUT_STYLE}>
                <option value="alle">Alle</option>
                <option value="aktiv">Nur aktive</option>
                <option value="inaktiv">Nur inaktive</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}>Suchen</Button>
            {filtered && <ButtonLink href={`/pilot/${orgSlug}/mitglieder`}>Zurücksetzen</ButtonLink>}
          </div>
        </form>

        {members.length === 0 ? (
          <EmptyState title={filtered ? 'Keine Mitglieder gefunden.' : 'Noch keine Mitglieder.'}
            body={filtered ? 'Passen Sie Suche oder Status an.' : 'Importieren Sie Ihre Mitgliederliste per CSV oder tragen Sie Mitglieder einzeln ein.'} />
        ) : (
          <ul className="cp-card cp-card-list">
            {members.map(member => <MemberRow key={member.id} orgSlug={orgSlug} member={member} />)}
          </ul>
        )}
      </main>
    </>
  )
}
