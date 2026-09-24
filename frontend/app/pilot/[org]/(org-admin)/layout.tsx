import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { archivo } from '../../../components/saas/fonts'
import GrainOverlay from '../../../components/saas/GrainOverlay'
import '../../../components/saas/tokens.css'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchMe, fetchOrganizationAdmin } from '../../../lib/saasAdminApi'
import { ViewerProvider } from '../../../components/saas/shell/ViewerContext'

/**
 * Gemeinsamer Titel-Fix für alle Org-Admin-Seiten (Dashboard, Teilnehmer,
 * Zahlungen, Warteliste, Aufgaben, Konfiguration) — ohne dies erben sie
 * alle den hart codierten KSV-Titel aus dem Root-Layout, siehe
 * pilot/[org]/page.tsx's generateMetadata für die volle Begründung.
 *
 * Nutzt die ADMIN-Sicht (fetchOrganizationAdmin), nicht die öffentliche
 * fetchOrganization: seit dem Betreiber-Builder ist ein Verein während der
 * Einrichtung ein Entwurf (site_published=false) und für die öffentliche
 * API unsichtbar (tenancy.py) — ein Admin, der genau diesen Entwurf gerade
 * bearbeitet, muss trotzdem den echten Vereinsnamen im Tab sehen.
 */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) return { title: 'CampsPilot – Verwaltung' }
  try {
    const org = await fetchOrganizationAdmin(orgSlug, token)
    return { title: org ? `${org.name} – Verwaltung` : 'CampsPilot – Verwaltung' }
  } catch {
    return { title: 'CampsPilot – Verwaltung' }
  }
}

/**
 * Auth-Gate für alle Vereins-Organisator-Screens (Richtung C).
 *
 * Bug, gefunden und geschlossen (MVP-Oberflächenauftrag, "keine verdeckte
 * Rollenübernahme als Abkürzung"): dieses Layout prüfte bisher nur, ob
 * überhaupt ein Token-Cookie gesetzt ist — NICHT, ob der eingeloggte
 * Nutzer tatsächlich Zugriff auf GENAU DIESEN Verein hat. Ein org_admin
 * von Verein A, der die URL eines fremden Vereins B erriet/eingab, bekam
 * diese Seite serverseitig ausgeliefert (nur die einzelnen Datenaufrufe
 * scheiterten dann mit 401/403, was zu kaputten Teilansichten statt einer
 * klaren Weiterleitung führte — kein Datenleck, aber verwirrend und keine
 * echte UI-seitige Zugriffsgrenze). Jetzt: derselbe `fetchMe`-Check wie im
 * Plattform-Layout — nur ein platform_owner ODER ein org_admin, der genau
 * diesen Slug in `admin_organization_slugs` hat, sieht die Seite; alle
 * anderen werden zu ihrem eigenen ersten Verein bzw. zum Login geleitet.
 * Die eigentliche Sicherheitsgrenze bleibt trotzdem das Backend
 * (app/auth_deps.py) — das hier ist zusätzlich für klare, ehrliche UX.
 *
 * Rendert bewusst kein Band hier — Band-Inhalt unterscheidet sich zwischen
 * Dashboard (groß, Org-Kennzahlen) und Command Center (schmal, Camp-Titel),
 * siehe components/saas/shell/MatchdayBand.tsx. Jede Seite rendert ihr
 * eigenes Band. `ViewerProvider` macht nur sichtbar, ALS WER man hier
 * gerade schaut (für den "Zur Plattform"-Link im Band, OrgSwitcher.tsx) —
 * keine zweite Berechtigungsgrenze.
 */
export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const token = await getAdminToken()
  if (!token) {
    redirect(`/pilot/${org}/login`)
  }

  const me = await fetchMe(token).catch(() => null)
  if (!me) {
    redirect(`/pilot/${org}/login`)
  }
  if (!me.is_platform_owner && !me.admin_organization_slugs.includes(org)) {
    const ownOrg = me.admin_organization_slugs[0]
    redirect(ownOrg ? `/pilot/${ownOrg}/dashboard` : `/pilot/${org}/login`)
  }

  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <GrainOverlay />
      <ViewerProvider isPlatformOwner={me.is_platform_owner}>{children}</ViewerProvider>
    </div>
  )
}
