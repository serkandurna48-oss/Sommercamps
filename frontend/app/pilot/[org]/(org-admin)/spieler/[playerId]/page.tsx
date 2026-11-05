import { loadPlayerRecord } from '../../../../../components/saas/playerAdminData'
import PlayerRecordScreen from '../../../../../components/saas/screens/PlayerRecordScreen'

export default async function PlayerRecordPage({ params, searchParams }: {
  params: Promise<{ org: string; playerId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: orgSlug, playerId } = await params
  const query = await searchParams
  const { org, record } = await loadPlayerRecord(orgSlug, playerId)
  return <PlayerRecordScreen orgSlug={orgSlug} org={org} record={record} query={query} />
}
