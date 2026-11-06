import { notFound } from 'next/navigation'
import {
  fetchPlayerAdmin,
  fetchPlayersAdmin,
  type OrganizationAdmin,
  type PlayerDetail,
  type PlayerSummary,
} from '../../lib/saasAdminApi'
import { loadWithBase } from './trainingAdminData'

/** Spielerliste; die Suche läuft im Browser (kein Suchbegriff in URL oder Server-Logs). */
export async function loadPlayers(orgSlug: string): Promise<{ org: OrganizationAdmin; players: PlayerSummary[] }> {
  const { org, data: players } = await loadWithBase(orgSlug, token => fetchPlayersAdmin(orgSlug, token))
  return { org, players }
}

export async function loadPlayerRecord(orgSlug: string, playerId: string): Promise<{ org: OrganizationAdmin; record: PlayerDetail }> {
  const { org, data: record } = await loadWithBase(orgSlug, token => fetchPlayerAdmin(orgSlug, playerId, token))
  if (!record) notFound()
  return { org, record }
}
