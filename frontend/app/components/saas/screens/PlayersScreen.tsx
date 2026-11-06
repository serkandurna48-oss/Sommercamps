import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import { PAGE } from '../ui/pageLayout'
import { orgTabs } from '../navTabs'
import PlayerList from '../player/PlayerList'
import type { OrganizationIdentityProps } from './types'
import type { PlayerSummary } from '../../../lib/saasAdminApi'

export default function PlayersScreen({ orgSlug, org, players }: OrganizationIdentityProps & { players: PlayerSummary[] }) {
  const brand = computeBrandTokens(org.primary_color)
  const withNotes = players.filter(player => player.note_count > 0).length

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Spieler"
        metrics={[{ label: 'Spieler', value: String(players.length) }, { label: 'Mit Notizen', value: String(withNotes) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE}>
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Spielerakten</h2>
        <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
          Interne Trainingsdokumentation, Ziele und Messwerte. Nur für Sie sichtbar, Eltern sehen nichts davon.
          Die Akten enthalten Daten von Kindern: bitte nicht weitergeben.
        </p>
        <PlayerList orgSlug={orgSlug} players={players} />
      </main>
    </>
  )
}
