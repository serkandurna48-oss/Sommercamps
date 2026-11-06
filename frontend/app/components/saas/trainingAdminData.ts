import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../lib/supabaseServer'
import {
  AdminAuthError,
  fetchClubMembersAdmin,
  fetchSessionRegistrationsAdmin,
  fetchTrainingOfferAdmin,
  fetchTrainingOffersAdmin,
  fetchTrainingSessionsAdmin,
  type ClubMember,
  type OrganizationAdmin,
  type RegistrationAdmin,
  type TrainingOffer,
  type TrainingSessionAdmin,
} from '../../lib/saasAdminApi'
import { getOrganizationAdmin } from './orgAdminData'

/** Token + Organisation, wie in den anderen Org-Admin-Seiten: ohne Sitzung
 * oder bei 401 Weiterleitung zum Login, unbekannter Verein -> Login. */
export async function loadBase(orgSlug: string): Promise<{ token: string; org: OrganizationAdmin }> {
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)
  let org: OrganizationAdmin | null
  try {
    org = await getOrganizationAdmin(orgSlug, token)
  } catch (error) {
    if (error instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw error
  }
  if (!org) redirect(`/pilot/${orgSlug}/login`)
  return { token, org }
}

export function rethrowAuth(orgSlug: string, error: unknown): never {
  if (error instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
  throw error
}

export async function loadTrainingOffers(orgSlug: string): Promise<{ org: OrganizationAdmin; offers: TrainingOffer[] }> {
  const { token, org } = await loadBase(orgSlug)
  try {
    return { org, offers: await fetchTrainingOffersAdmin(orgSlug, token) }
  } catch (error) {
    return rethrowAuth(orgSlug, error)
  }
}

export async function loadTrainingOrg(orgSlug: string): Promise<OrganizationAdmin> {
  return (await loadBase(orgSlug)).org
}

export interface TrainingOfferData {
  org: OrganizationAdmin
  offer: TrainingOffer
  sessions: TrainingSessionAdmin[]
  /** Buchungen je Termin-ID. */
  registrationsBySession: Record<string, RegistrationAdmin[]>
}

export async function loadTrainingOffer(orgSlug: string, offerId: string): Promise<TrainingOfferData> {
  const { token, org } = await loadBase(orgSlug)
  try {
    const offer = await fetchTrainingOfferAdmin(orgSlug, offerId, token)
    if (!offer) notFound()
    const sessions = await fetchTrainingSessionsAdmin(orgSlug, offer.id, token)
    const lists = await Promise.all(sessions.map(session => fetchSessionRegistrationsAdmin(orgSlug, offer.id, session.id, token)))
    return { org, offer, sessions, registrationsBySession: Object.fromEntries(sessions.map((session, i) => [session.id, lists[i]])) }
  } catch (error) {
    if (error instanceof AdminAuthError) return rethrowAuth(orgSlug, error)
    throw error
  }
}

/** Alle Mitglieder; Suche und Statusfilter laufen im Browser (kein Suchbegriff in URL oder Server-Logs). */
export async function loadClubMembers(orgSlug: string): Promise<{ org: OrganizationAdmin; members: ClubMember[] }> {
  const { token, org } = await loadBase(orgSlug)
  try {
    return { org, members: await fetchClubMembersAdmin(orgSlug, token) }
  } catch (error) {
    return rethrowAuth(orgSlug, error)
  }
}

export interface UpcomingSession {
  offer: TrainingOffer
  session: TrainingSessionAdmin
}

export interface TrainingOverview {
  offers: TrainingOffer[]
  /** Published sessions that have not started yet, earliest first. */
  upcoming: UpcomingSession[]
  error: boolean
}

/**
 * Dashboard: offers plus their upcoming sessions. Runs next to the camp
 * loader (Promise.all in dashboard/page.tsx), never after it. A failure only
 * hides the training tiles; the camp dashboard stays usable.
 * Perf note: one request per offer for the sessions (no summary endpoint yet).
 */
export async function loadTrainingOverview(orgSlug: string, now = new Date()): Promise<TrainingOverview> {
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)
  try {
    const offers = (await fetchTrainingOffersAdmin(orgSlug, token)).filter(offer => offer.status !== 'archived')
    const perOffer = await Promise.all(offers.map(async offer =>
      (await fetchTrainingSessionsAdmin(orgSlug, offer.id, token)).map(session => ({ offer, session }))))
    const nowIso = now.toISOString()
    const upcoming = perOffer.flat()
      .filter(({ session }) => session.status === 'published' && new Date(session.starts_at).toISOString() >= nowIso)
      .sort((a, b) => Date.parse(a.session.starts_at) - Date.parse(b.session.starts_at))
    return { offers, upcoming, error: false }
  } catch (error) {
    if (error instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    return { offers: [], upcoming: [], error: true }
  }
}
