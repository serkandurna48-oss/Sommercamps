'use client'

import AdminRouteState from '../../../../../components/saas/screens/AdminRouteState'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminRouteState reset={reset} />
}
