import { isModuleDisabled } from '../../../../../components/saas/trainingAdminData'
import ModuleDisabledScreen from '../../../../../components/saas/screens/ModuleDisabledScreen'
import { loadPlayerRecord } from '../../../../../components/saas/playerAdminData'
import PlayerRecordScreen from '../../../../../components/saas/screens/PlayerRecordScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Spielerakte' }

export default async function PlayerRecordPage({ params, searchParams }: {
  params: Promise<{ org: string; playerId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: orgSlug, playerId } = await params
  if (await isModuleDisabled(orgSlug, 'players')) return <ModuleDisabledScreen orgSlug={orgSlug} module="players" />
  const query = await searchParams
  const { org, record } = await loadPlayerRecord(orgSlug, playerId)
  return <PlayerRecordScreen orgSlug={orgSlug} org={org} record={record} query={query} />
}
