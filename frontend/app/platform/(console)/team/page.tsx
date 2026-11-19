import { redirect } from 'next/navigation'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { fetchPlatformOwnersAdmin } from '../../../lib/saasAdminApi'
import { PAGE } from '../../../components/saas/ui/pageLayout'
import TeamSection from './TeamSection'

/** Plattform-Team: wer hat Plattform-Zugang (platform_owner). Das Layout
 * lässt nur platform_owner herein; jede Änderung prüft das Backend erneut. */
export default async function PlatformTeamPage() {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')

  const owners = await fetchPlatformOwnersAdmin(token)

  return (
    <main className={PAGE}>
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
        Team
      </h1>
      <p className="cp-body mb-6 max-w-[640px]" style={{ color: 'var(--cp-muted)' }}>
        Personen mit Plattform-Zugang sehen und verwalten alle Vereine. Vereinsadmins verwaltest du auf der Seite des
        jeweiligen Vereins.
      </p>
      <TeamSection owners={owners} />
    </main>
  )
}
