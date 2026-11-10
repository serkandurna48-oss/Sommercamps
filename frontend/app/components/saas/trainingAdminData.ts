import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../lib/supabaseServer'
import {
  AdminAuthError,
  fetchClubMemberAdmin,
  fetchClubMembersAdmin,
  fetchTrainingOfferOverviewAdmin,
  fetchTrainingOffersAdmin,
  fetchTrainingSessionsAdmin,
  type ClubMember,
  type ClubMemberDetail,
  type OrganizationAdmin,
  type RegistrationAdmin,
  type TrainingOffer,
  type TrainingSessionAdmin,
} from '../../lib/saasAdminApi'
import { getOrganizationAdmin } from './orgAdminData'
import { hasModule, type OrgModule } from '../../lib/orgModules'

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

/**
 * Like `loadBase`, but the page data starts in the same round as the organisation
 * (both need only the token). Checks keep the old order: organisation first (auth ->
 * login, unknown club -> login), then the page data (auth -> login, else rethrow, which
 * also passes `notFound()` through).
 */
export async function loadWithBase<T>(orgSlug: string, load: (token: string) => Promise<T>): Promise<{ token: string; org: OrganizationAdmin; data: T }> {
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)
  const [orgOutcome, dataOutcome] = await Promise.allSettled([getOrganizationAdmin(orgSlug, token), load(token)])
  if (orgOutcome.status === 'rejected') {
    if (orgOutcome.reason instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw orgOutcome.reason
  }
  const org = orgOutcome.value
  if (!org) redirect(`/pilot/${orgSlug}/login`)
  if (dataOutcome.status === 'rejected') return rethrowAuth(orgSlug, dataOutcome.reason)
  return { token, org, data: dataOutcome.value }
}

/** True when the club has `module` switched off: the page then renders
 * ModuleDisabledScreen instead of loading data (the API would answer 403
 * module_disabled). The organisation comes from the per-request cache the layout filled. */
export async function isModuleDisabled(orgSlug: string, module: OrgModule): Promise<boolean> {
  const { org } = await loadBase(orgSlug)
  return !hasModule(org, module)
}

export function rethrowAuth(orgSlug: string, error: unknown): never {
  if (error instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
  throw error
}

export async function loadTrainingOffers(orgSlug: string): Promise<{ org: OrganizationAdmin; offers: TrainingOffer[] }> {
  const { org, data: offers } = await loadWithBase(orgSlug, token => fetchTrainingOffersAdmin(orgSlug, token))
  return { org, offers }
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
  // One request (offer + sessions + bookings) next to the organisation instead of 2 + N in 4 rounds.
  const { org, data: overview } = await loadWithBase(orgSlug, token => fetchTrainingOfferOverviewAdmin(orgSlug, offerId, token))
  if (!overview) notFound()
  const sessions: TrainingSessionAdmin[] = overview.sessions.map(({ registrations, ...session }) => { void registrations; return session })
  return {
    org,
    offer: overview.offer,
    sessions,
    registrationsBySession: Object.fromEntries(overview.sessions.map(session => [session.id, session.registrations])),
  }
}

/** Alle Mitglieder; Suche und Statusfilter laufen im Browser (kein Suchbegriff in URL oder Server-Logs). */
export async function loadClubMembers(orgSlug: string): Promise<{ org: OrganizationAdmin; members: ClubMember[] }> {
  const { org, data: members } = await loadWithBase(orgSlug, token => fetchClubMembersAdmin(orgSlug, token))
  return { org, members }
}

/** Ein Mitglied (Detailseite); unbekannte oder fremde ID = 404. */
export async function loadClubMember(orgSlug: string, memberId: string): Promise<{ org: OrganizationAdmin; member: ClubMemberDetail }> {
  const { org, data: member } = await loadWithBase(orgSlug, token => fetchClubMemberAdmin(orgSlug, memberId, token))
  if (!member) notFound()
  return { org, member }
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
