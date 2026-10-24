import AdminLayoutUnavailable from '../../components/saas/screens/AdminLayoutUnavailable'
import Link from 'next/link'
import StagingBanner from '../../components/saas/StagingBanner'
import { archivo } from '../../components/saas/fonts'
import GrainOverlay from '../../components/saas/GrainOverlay'
import '../../components/saas/tokens.css'
import './review.css'
import { getValidAccessToken } from '../../lib/supabaseServer'
import { AdminAuthError, fetchMe, fetchOrganizationsAdmin } from '../../lib/saasAdminApi'
import ReviewNavLink from './ReviewNavLink'
import { redirect } from 'next/navigation'
import { platformLogoutAction } from '../logoutAction'

export const metadata = { title: 'CampsPilot Plattform' }

/**
 * Auth-Gate für die Plattform-Konsole (/platform) — der Bereich, in dem
 * der CampsPilot-Betreiber (platform_owner) alle Vereine sieht und neue
 * anlegt. Getrennt von den Vereins-Admin-Screens unter
 * /pilot/[org]/(org-admin) (dort verwaltet ein Verein sich selbst), nutzt
 * aber dieselbe Supabase-Auth-Identität/denselben Cookie — ein Login
 * reicht für beides (siehe lib/adminSession.ts).
 *
 * Seit feat/platform-foundation: ein gültiger Account allein reicht hier
 * nicht mehr — nur ein platform_owner darf die Konsole öffnen. Ein
 * org_admin-Konto wird zu seiner eigenen Vereinsverwaltung
 * weitergeleitet, statt einen 403 der einzelnen Konsolenseiten zu sehen
 * (die Berechtigung selbst prüft ausschließlich das Backend erneut, siehe
 * app/auth_deps.py — diese Weiterleitung ist reine UX, keine
 * Sicherheitsgrenze).
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')

  const me = await fetchMe(token).catch(error => {
    if (error instanceof AdminAuthError) return null
    return undefined
  })
  if (me === undefined) return <AdminLayoutUnavailable platform />
  if (!me) redirect('/platform/login')
  if (!me.is_platform_owner) {
    const firstOrg = me.admin_organization_slugs[0]
    redirect(firstOrg ? `/pilot/${firstOrg}/dashboard` : '/platform/login')
  }

  const organizations = await fetchOrganizationsAdmin(token)

  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <StagingBanner />
      <GrainOverlay />
      <header className="border-b" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-ink)' }}>
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/platform" className="cp-subheading" style={{ color: '#FFFFFF' }}>
              CampsPilot Plattform
            </Link>
            <nav aria-label="Plattform-Konsole" className="flex flex-wrap items-center gap-4">
              <ReviewNavLink orgs={organizations} />
              <Link href="/platform" prefetch={false} className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Vereine
              </Link>
              <Link href="/platform/registrations" prefetch={false} className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Anmeldungen
              </Link>
              <Link href="/platform/audit-log" prefetch={false} className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Änderungsverlauf
              </Link>
            </nav>
          </div>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              className="cp-focus min-h-[44px] min-w-[44px] cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#FFFFFF' }}
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  )
}
