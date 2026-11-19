import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminLayoutUnavailable from '../../components/saas/screens/AdminLayoutUnavailable'
import CampsPilotMark from '../../components/saas/brand/CampsPilotMark'
import Button from '../../components/saas/ui/Button'
import { AdminAuthError, fetchSalesMe } from '../../lib/saasAdminApi'
import { getValidAccessToken } from '../../lib/supabaseServer'
import { platformLogoutAction } from '../../platform/logoutAction'
import { ROLE_LABEL } from '../labels'

const NAV = 'cp-focus cp-body inline-flex min-h-11 items-center'

/** Gate for /vertrieb: sales reps, the sales lead and platform owners. Any
 * other account goes back to /platform, which routes it to its own area.
 * UX only — the backend checks every request again. */
export default async function VertriebLayout({ children }: { children: React.ReactNode }) {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')

  const me = await fetchSalesMe(token).catch(error => {
    if (error instanceof AdminAuthError) return 'auth' as const
    return undefined
  })
  if (me === undefined) return <AdminLayoutUnavailable platform />
  if (me === 'auth') redirect('/platform/login')
  if (me === null) redirect('/platform')

  return (
    <>
      <header className="cp-band px-4 pt-3 pb-1 md:px-6 md:pt-4 md:pb-2">
        <div className="mx-auto flex max-w-[1080px] flex-col">
          <div className="flex min-h-[44px] items-center justify-between gap-4 pb-2 md:pb-3">
            <Link href="/vertrieb" className="cp-focus flex min-w-0 items-center gap-3" style={{ color: 'var(--cp-on-band)' }}>
              <CampsPilotMark width={30} height={20} />
              <span className="cp-lockup">
                CampsPilot{' '}
                <span className="cp-label max-sm:hidden" style={{ color: 'var(--cp-on-band-2)', fontStretch: '100%', letterSpacing: 0 }}>
                  {ROLE_LABEL[me.role]}
                </span>
              </span>
            </Link>
            <form action={platformLogoutAction}>
              <Button type="submit">Abmelden</Button>
            </form>
          </div>
          <nav aria-label="Vertrieb" className="flex flex-wrap items-center gap-x-6 border-t pt-1" style={{ borderColor: 'var(--cp-band-line)' }}>
            <Link href="/vertrieb" prefetch={false} className={NAV} style={{ color: 'var(--cp-on-band-2)' }}>
              {me.can_manage ? 'Leads' : 'Meine Leads'}
            </Link>
            <Link href="/vertrieb/neu" prefetch={false} className={NAV} style={{ color: 'var(--cp-on-band-2)' }}>
              Neuer Lead
            </Link>
            {me.can_manage && (
              <Link href="/vertrieb/team" prefetch={false} className={NAV} style={{ color: 'var(--cp-on-band-2)' }}>
                Team
              </Link>
            )}
            {me.role === 'owner' && (
              <>
                <Link href="/vertrieb/import" prefetch={false} className={NAV} style={{ color: 'var(--cp-on-band-2)' }}>
                  Import
                </Link>
                <Link href="/platform" prefetch={false} className={NAV} style={{ color: 'var(--cp-on-band-2)' }}>
                  Plattform
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </>
  )
}
