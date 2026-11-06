import { loadPlayers } from '../../../../components/saas/playerAdminData'
import PlayersScreen from '../../../../components/saas/screens/PlayersScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Spieler' }

export default async function PlayersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, players } = await loadPlayers(orgSlug)
  return <PlayersScreen orgSlug={orgSlug} org={org} players={players} />
}
