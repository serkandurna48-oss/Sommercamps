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
import BrandMark from '../../components/marketing/BrandMark'
import Button from '../../components/saas/ui/Button'

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
      {/* Same band as the club admin (MatchdayBand): dark surface, accent line, identity left, sign-out right. */}
      <header className="px-4 pt-3 pb-1 md:px-6 md:pt-4 md:pb-2" style={{ background: 'var(--cp-band)', borderTop: '3px solid #c24f1a', color: 'var(--cp-on-band)', ['--accent' as string]: '#d4581f' }}>
        <div className="mx-auto flex max-w-[1080px] flex-col">
          <div className="flex min-h-[44px] items-center justify-between gap-4 pb-2 md:pb-3">
            <Link href="/platform" className="cp-focus flex items-center gap-3" style={{ color: 'var(--cp-on-band)' }}>
              <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'var(--cp-band-2)' }} aria-hidden="true">
                <BrandMark width={22} height={15} />
              </span>
              <span className="cp-subheading">CampsPilot Plattform</span>
            </Link>
            <form action={platformLogoutAction}>
              <Button type="submit">Abmelden</Button>
            </form>
          </div>
          <nav aria-label="Plattform-Konsole" className="flex flex-wrap items-center gap-x-6 border-t pt-1" style={{ borderColor: 'var(--cp-band-line)' }}>
            <ReviewNavLink orgs={organizations} />
            <Link href="/platform" prefetch={false} className="cp-focus cp-body inline-flex min-h-11 items-center" style={{ color: 'var(--cp-on-band-2)' }}>
              Vereine
            </Link>
            <Link href="/platform/registrations" prefetch={false} className="cp-focus cp-body inline-flex min-h-11 items-center" style={{ color: 'var(--cp-on-band-2)' }}>
              Anmeldungen
            </Link>
            <Link href="/platform/audit-log" prefetch={false} className="cp-focus cp-body inline-flex min-h-11 items-center" style={{ color: 'var(--cp-on-band-2)' }}>
              Änderungsverlauf
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
