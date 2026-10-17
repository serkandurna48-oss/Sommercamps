import { notFound, redirect } from 'next/navigation'
import { getAdminToken } from '../../lib/adminSession'
import {
  AdminAuthError,
  fetchCampsAdmin,
  fetchOrganizationAdmin,
  fetchRegistrationsAdmin,
  type CampAdmin,
  type OrganizationAdmin,
  type RegistrationAdmin,
} from '../../lib/saasAdminApi'

/**
 * Gemeinsame Lade-Sequenz für alle Org-Admin-Seiten: Token prüfen ->
 * Organisation laden -> Camps laden -> Registrierungen je Camp laden.
 * Extrahiert aus dashboard/page.tsx (Schritt 7) und
 * camps/[campSlug]/page.tsx (Command Center) — beide nutzen jetzt diese
 * eine Stelle statt die Sequenz jeweils selbst zu wiederholen, was mit
 * jeder weiteren Org-Admin-Seite (Aufgaben/Warteliste/Zahlungen) sonst
 * viermal dieselbe Kopie gewesen wäre.
 */
export interface OrgAdminData {
  token: string
  org: OrganizationAdmin
  camps: CampAdmin[]
  registrationsByCamp: RegistrationAdmin[][]
}

export async function loadOrgAdminData(orgSlug: string): Promise<OrgAdminData> {
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  // Admin-Sicht (fetchOrganizationAdmin), nicht die öffentliche
  // fetchOrganization: ein Entwurf (site_published=false) ist für die
  // öffentliche API seit dem Betreiber-Builder unsichtbar (tenancy.py) —
  // ein eingeloggter Admin muss die eigene Verwaltung trotzdem öffnen
  // können, siehe dieselbe Begründung in (org-admin)/layout.tsx.
  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  let camps: CampAdmin[]
  try {
    camps = await fetchCampsAdmin(orgSlug, token)
  } catch (err) {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  }

  const registrationsByCamp = await Promise.all(
    camps.map(camp => fetchRegistrationsAdmin(orgSlug, camp.slug, token)),
  )

  return { token, org, camps, registrationsByCamp }
}

export interface CampAdminData {
  token: string
  org: OrganizationAdmin
  camp: CampAdmin
  registrations: RegistrationAdmin[]
}

/** Camp-Ebene derselben Sequenz — 404 (nicht redirect), wenn der Slug zu
 * keinem Camp dieser Organisation gehört (mirrors CampStubScreen). */
export async function loadCampAdminData(orgSlug: string, campSlug: string): Promise<CampAdminData> {
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  let camps: CampAdmin[]
  let registrations: RegistrationAdmin[]
  try {
    camps = await fetchCampsAdmin(orgSlug, token)
    registrations = await fetchRegistrationsAdmin(orgSlug, campSlug, token)
  } catch (err) {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  }

  const camp = camps.find(c => c.slug === campSlug)
  if (!camp) notFound()

  return { token, org, camp, registrations }
}
