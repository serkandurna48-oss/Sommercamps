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
async function loadBase(orgSlug: string): Promise<{ token: string; org: OrganizationAdmin }> {
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

function rethrowAuth(orgSlug: string, error: unknown): never {
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

export type MemberStatusFilter = 'alle' | 'aktiv' | 'inaktiv'

export function parseMemberStatus(value: string | string[] | undefined): MemberStatusFilter {
  return value === 'aktiv' || value === 'inaktiv' ? value : 'alle'
}

export async function loadClubMembers(
  orgSlug: string,
  filter: { q: string; status: MemberStatusFilter },
): Promise<{ org: OrganizationAdmin; members: ClubMember[] }> {
  const { token, org } = await loadBase(orgSlug)
  try {
    const active = filter.status === 'alle' ? undefined : filter.status === 'aktiv'
    return { org, members: await fetchClubMembersAdmin(orgSlug, token, { q: filter.q, active }) }
  } catch (error) {
    return rethrowAuth(orgSlug, error)
  }
}
