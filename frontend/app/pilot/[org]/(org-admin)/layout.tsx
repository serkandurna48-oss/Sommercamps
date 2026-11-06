import AdminLayoutUnavailable from '../../../components/saas/screens/AdminLayoutUnavailable'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminShell from '../../../components/saas/shell/AdminShell'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminAuthError, fetchMe } from '../../../lib/saasAdminApi'
import { getOrganizationAdmin } from '../../../components/saas/orgAdminData'

/**
 * Tab title for all org-admin pages: static on purpose. A `generateMetadata` that loads
 * the organisation runs for every metadata prefetch of a nav or content link, i.e. one
 * extra admin request (auth + DB) per visible link (perf-analysis.md F4: dashboard +9).
 * Pages set their own static name through the template ("Zahlungen – CampsPilot"). The
 * club name stays visible in the sidebar/top bar, which loads it once per navigation.
 * Static here also keeps the hard-coded KSV title of the root layout out of the admin.
 */
export const metadata: Metadata = {
  title: { default: 'CampsPilot – Verwaltung', template: '%s – CampsPilot' },
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
 * Die Navigation (Seitenleiste ab 1024 px, sonst obere Leiste mit Schublade)
 * sitzt hier im Layout und bleibt beim Seitenwechsel stehen; jede Seite
 * rendert nur ihren schlanken Seitenkopf (shell/PageHeader.tsx).
 * `ViewerProvider` macht nur sichtbar, ALS WER man hier gerade schaut (für
 * den "Zur Plattform"-Link in der Seitenleiste) — keine zweite
 * Berechtigungsgrenze.
 */
export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const token = await getValidAccessToken()
  if (!token) {
    redirect(`/pilot/${org}/login`)
  }

  // Identity loads in the same round as the access check (shared per request via cache()
  // with the page loaders). It is only rendered after the check below has passed; a
  // foreign club answers 403 there anyway (the backend stays the boundary).
  const AUTH_EXPIRED = Symbol('auth')
  const identityPromise = getOrganizationAdmin(org, token).catch(error => {
    if (error instanceof AdminAuthError) return AUTH_EXPIRED
    // Page loaders report API failures inside the route error boundary.
    return null
  })
  const me = await fetchMe(token).catch(error => {
    if (error instanceof AdminAuthError) return null
    return undefined
  })
  if (me === undefined) return <AdminLayoutUnavailable />
  if (!me) {
    redirect(`/pilot/${org}/login`)
  }
  if (!me.is_platform_owner && !me.admin_organization_slugs.includes(org)) {
    const ownOrg = me.admin_organization_slugs[0]
    redirect(ownOrg ? `/pilot/${ownOrg}/dashboard` : `/pilot/${org}/login`)
  }

  // AdminShell reserves the measured navigation and selection heights, including the safe area.
  const identity = await identityPromise
  if (identity === AUTH_EXPIRED) redirect(`/pilot/${org}/login`)
  return (
    <AdminShell orgSlug={org} org={identity ?? undefined} isPlatformOwner={me.is_platform_owner}>{children}</AdminShell>
  )
}
