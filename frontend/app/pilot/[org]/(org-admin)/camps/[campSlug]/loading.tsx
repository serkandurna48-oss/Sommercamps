import { archivo } from '../../../../../components/saas/fonts'
import Skeleton from '../../../../../components/saas/state/Skeleton'
import '../../../../../components/saas/tokens.css'

export default function CampLoading() {
  return (
    <div className={`${archivo.variable} cp-scope min-h-screen`}>
      <div style={{ background: 'var(--cp-band)' }} className="px-6 pt-5 pb-5">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-6 w-56" />
        </div>
      </div>
      <main className="mx-auto max-w-[1080px] px-4 py-10 md:px-8 xl:px-6">
        <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="mb-4 h-11 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    </div>
  )
}
