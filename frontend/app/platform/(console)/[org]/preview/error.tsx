'use client'

import PlatformRouteState from '../../../../components/saas/screens/PlatformRouteState'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PlatformRouteState reset={reset} />
}
