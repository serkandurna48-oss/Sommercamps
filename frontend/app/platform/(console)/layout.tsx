import Link from 'next/link'
import { archivo } from '../../components/saas/fonts'
import GrainOverlay from '../../components/saas/GrainOverlay'
import '../../components/saas/tokens.css'
import { getAdminToken } from '../../lib/adminSession'
import { fetchMe } from '../../lib/saasAdminApi'
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
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const me = await fetchMe(token).catch(() => null)
  if (!me) redirect('/platform/login')
  if (!me.is_platform_owner) {
    const firstOrg = me.admin_organization_slugs[0]
    redirect(firstOrg ? `/pilot/${firstOrg}/dashboard` : '/platform/login')
  }

  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <GrainOverlay />
      <div className="border-b" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-ink)' }}>
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-6">
            <Link href="/platform" className="cp-subheading" style={{ color: '#FFFFFF' }}>
              CampsPilot Plattform
            </Link>
            <nav className="hidden gap-4 sm:flex">
              <Link href="/platform" className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Vereine
              </Link>
              <Link href="/platform/registrations" className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Anmeldungen
              </Link>
              <Link href="/platform/audit-log" className="cp-chip" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Änderungsverlauf
              </Link>
            </nav>
          </div>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#FFFFFF' }}
            >
              Abmelden
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  )
}
