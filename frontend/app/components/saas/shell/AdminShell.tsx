import { archivo } from '../fonts'
import GrainOverlay from '../GrainOverlay'
import { ViewerProvider } from './ViewerContext'
import '../tokens.css'

export default function AdminShell({ children, isPlatformOwner = false }: {
  children: React.ReactNode
  isPlatformOwner?: boolean
}) {
  return (
    <div className={`${archivo.variable} cp-scope min-h-screen pb-16 md:pb-0`}>
      <GrainOverlay />
      <ViewerProvider isPlatformOwner={isPlatformOwner}>{children}</ViewerProvider>
    </div>
  )
}
