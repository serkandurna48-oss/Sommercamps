import { redirect } from 'next/navigation'
import { archivo } from '../../../components/saas/fonts'
import GrainOverlay from '../../../components/saas/GrainOverlay'
import '../../../components/saas/tokens.css'
import { getAdminToken } from '../../../lib/adminSession'

/**
 * Auth-Gate für alle Vereins-Organisator-Screens (Richtung C). Prüft nur,
 * ob überhaupt ein Token-Cookie gesetzt ist — die eigentliche Gültigkeit
 * prüft backend_saas bei jedem Datenaufruf (401 -> AdminAuthError, von den
 * Seiten selbst behandelt). Reicht für dieses Ticket (Frage 2 der
 * Bestandsaufnahme: ein plattformweiter Admin, keine Rollen) — kein
 * per-Verein-Zugriffsschutz, das bleibt eine spätere Entscheidung.
 *
 * Rendert bewusst kein Band hier — Band-Inhalt unterscheidet sich zwischen
 * Dashboard (groß, Org-Kennzahlen) und Command Center (schmal, Camp-Titel),
 * siehe components/saas/shell/MatchdayBand.tsx. Jede Seite rendert ihr
 * eigenes Band.
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

  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <GrainOverlay />
      {children}
    </div>
  )
}
