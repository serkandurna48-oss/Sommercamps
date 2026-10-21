import { archivo } from '../fonts'
import GrainOverlay from '../GrainOverlay'
import { ViewerProvider } from './ViewerContext'
import { OrganizationProvider, type OrganizationIdentity } from './OrganizationContext'
import '../tokens.css'

export default function AdminShell({ children, isPlatformOwner = false, org }: {
  children: React.ReactNode
  isPlatformOwner?: boolean
  org?: OrganizationIdentity
}) {
  return (
    <div className={`${archivo.variable} cp-scope min-h-screen cp-admin-layout`}>
      <GrainOverlay />
      <OrganizationProvider org={org}><ViewerProvider isPlatformOwner={isPlatformOwner}>{children}</ViewerProvider></OrganizationProvider>
    </div>
  )
}
