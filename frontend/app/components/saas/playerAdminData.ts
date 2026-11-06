import { notFound } from 'next/navigation'
import {
  fetchPlayerAdmin,
  fetchPlayersAdmin,
  type OrganizationAdmin,
  type PlayerDetail,
  type PlayerSummary,
} from '../../lib/saasAdminApi'
import { loadBase, rethrowAuth } from './trainingAdminData'

/** Spielerliste; die Suche läuft im Browser (kein Suchbegriff in URL oder Server-Logs). */
export async function loadPlayers(orgSlug: string): Promise<{ org: OrganizationAdmin; players: PlayerSummary[] }> {
  const { token, org } = await loadBase(orgSlug)
  try {
    return { org, players: await fetchPlayersAdmin(orgSlug, token) }
  } catch (error) {
    return rethrowAuth(orgSlug, error)
  }
}

export async function loadPlayerRecord(orgSlug: string, playerId: string): Promise<{ org: OrganizationAdmin; record: PlayerDetail }> {
  const { token, org } = await loadBase(orgSlug)
  try {
    const record = await fetchPlayerAdmin(orgSlug, playerId, token)
    if (!record) notFound()
    return { org, record }
  } catch (error) {
    return rethrowAuth(orgSlug, error)
  }
}
