import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import PlayerList from '../player/PlayerList'
import { hasModule } from '../../../lib/orgModules'
import type { OrganizationIdentityProps } from './types'
import type { PlayerSummary } from '../../../lib/saasAdminApi'

export default function PlayersScreen({ orgSlug, org, players }: OrganizationIdentityProps & { players: PlayerSummary[] }) {
  const withNotes = players.filter(player => player.note_count > 0).length

  return (
    <>
      <PageHeader
        title="Spieler"
        subtitle="Interne Trainingsdokumentation, Ziele und Messwerte – nur für Sie sichtbar. Enthält Daten von Kindern: bitte nicht weitergeben."
        metrics={[{ label: 'Spieler', value: String(players.length) }, { label: 'Mit Notizen', value: String(withNotes) }]}
      />

      <main className={ADMIN_PAGE}>
        <h2 className="sr-only">Spielerakten</h2>
        <PlayerList orgSlug={orgSlug} players={players} showMembership={hasModule(org, 'members')} />
      </main>
    </>
  )
}
