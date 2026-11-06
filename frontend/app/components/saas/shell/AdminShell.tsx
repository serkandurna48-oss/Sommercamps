import { archivo } from '../fonts'
import GrainOverlay from '../GrainOverlay'
import { computeBrandTokens } from '../brandPipeline'
import AdminSidebar from './AdminSidebar'
import { ViewerProvider } from './ViewerContext'
import { OrganizationProvider, type OrganizationIdentity } from './OrganizationContext'
import '../tokens.css'

/**
 * Admin frame: sidebar (>= 1024 px) or top bar + drawer (< 1024 px) next to a
 * full-width content column. Pages render their own slim PageHeader and
 * main. Without `orgSlug` (e.g. fatal layout states) only the frame renders.
 */
export default function AdminShell({ children, isPlatformOwner = false, org, orgSlug, beforeContent, sidebarPrefsRaw = null }: {
  children: React.ReactNode
  /** Sidebar preference cookie (see shell/sidebarPrefs.ts); null renders the expanded default. */
  sidebarPrefsRaw?: string | null
  isPlatformOwner?: boolean
  org?: OrganizationIdentity
  orgSlug?: string
  /** Rendered above the page content inside the content column (preview notice). */
  beforeContent?: React.ReactNode
}) {
  return (
    <div className={`${archivo.variable} cp-scope cp-admin min-h-screen cp-admin-layout`}>
      <GrainOverlay />
      <OrganizationProvider org={org}><ViewerProvider isPlatformOwner={isPlatformOwner}>
        <div className="cp-admin-frame">
          {orgSlug && (
            <AdminSidebar
              orgSlug={orgSlug}
              orgName={org?.name ?? orgSlug}
              orgLogoUrl={org?.logo_url ?? null}
              clubColor={org ? computeBrandTokens(org.primary_color).brand : undefined}
              sidebarPrefsRaw={sidebarPrefsRaw}
            />
          )}
          <div className="cp-admin-content">
            {beforeContent}
            {children}
          </div>
        </div>
      </ViewerProvider></OrganizationProvider>
    </div>
  )
}
