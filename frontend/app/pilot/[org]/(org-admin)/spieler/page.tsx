import { isModuleDisabled } from '../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../components/saas/screens/ModuleDisabledScreen'
import { loadPlayers } from '../../../../components/saas/playerAdminData'
import PlayersScreen from '../../../../components/saas/screens/PlayersScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Spieler' }

export default async function PlayersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  if (await isModuleDisabled(orgSlug, 'players')) return <ModuleDisabledScreen orgSlug={orgSlug} module="players" />
  const { org, players } = await loadPlayers(orgSlug)
  return <PlayersScreen orgSlug={orgSlug} org={org} players={players} />
}
