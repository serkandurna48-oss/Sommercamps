import type { Metadata } from 'next'
import { archivo } from '../components/saas/fonts'
import GrainOverlay from '../components/saas/GrainOverlay'
import StagingBanner from '../components/saas/StagingBanner'
import '../components/saas/tokens.css'

export const metadata: Metadata = { title: 'CampsPilot Vertrieb', robots: { index: false } }

/** Shell for the sales CRM. Authorization lives in (app)/layout.tsx and,
 * authoritatively, in the backend (/sales); the password page stays public. */
export default function VertriebShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${archivo.variable} cp-scope cp-admin min-h-screen`}>
      <StagingBanner />
      <GrainOverlay />
      {children}
    </div>
  )
}
