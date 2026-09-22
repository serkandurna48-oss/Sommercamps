import { archivo } from '../../../../components/saas/fonts'
import Skeleton from '../../../../components/saas/state/Skeleton'
import '../../../../components/saas/tokens.css'

/** Next.js zeigt dies automatisch, während die async Server-Komponente
 * lädt (App-Router-Suspense-Konvention) — kein eigener Ladezustand im
 * Code der Seite nötig. Ruhige Flächen statt Puls/Shimmer (Abschnitt 7:
 * "nichts pulsiert"). */
export default function DashboardLoading() {
  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <div style={{ background: 'var(--cp-band)' }} className="px-6 pt-5 pb-5">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-12 w-64" />
        </div>
      </div>
      <main className="mx-auto max-w-[920px] px-4 py-10 md:px-8 xl:px-6">
        <Skeleton className="mb-4 h-7 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="mt-10 mb-4 h-7 w-32" />
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  )
}
