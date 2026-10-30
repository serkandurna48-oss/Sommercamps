import { de } from '../../../lib/i18n/de'
import ErrorState from '../state/ErrorState'
import Skeleton from '../state/Skeleton'
import { PAGE } from '../ui/pageLayout'

export default function PlatformRouteState({ reset }: { reset?: () => void }) {
  return <main className={PAGE}>
    {reset ? <ErrorState onRetry={reset} dashboardHref="/platform" /> :
      <div role="status" aria-label={de.states.loading}>
        <Skeleton className="mb-4 h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>}
  </main>
}
