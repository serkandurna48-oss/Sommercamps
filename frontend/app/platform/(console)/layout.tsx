import Link from 'next/link'
import { archivo } from '../../components/saas/fonts'
import GrainOverlay from '../../components/saas/GrainOverlay'
import '../../components/saas/tokens.css'
import { getAdminToken } from '../../lib/adminSession'
import { redirect } from 'next/navigation'
import { platformLogoutAction } from '../logoutAction'

export const metadata = { title: 'CampsPilot Plattform' }

/**
 * Auth-Gate für die Plattform-Konsole (/platform) — der Bereich, in dem
 * der CampsPilot-Betreiber selbst alle Vereine sieht und neue anlegt.
 * Getrennt von den Vereins-Admin-Screens unter /pilot/[org]/(org-admin)
 * (dort verwaltet ein Verein sich selbst), nutzt aber dieselbe Admin-
 * Identität/denselben Cookie — ein Login reicht für beides (siehe
 * lib/adminSession.ts).
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <GrainOverlay />
      <div className="border-b" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-ink)' }}>
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-4 py-4 md:px-8">
          <Link href="/platform" className="cp-subheading" style={{ color: '#FFFFFF' }}>
            CampsPilot Plattform
          </Link>
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
