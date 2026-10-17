'use client'

import { archivo } from '../../../../components/saas/fonts'
import ErrorState from '../../../../components/saas/state/ErrorState'
import '../../../../components/saas/tokens.css'

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`${archivo.variable} cp-scope flex min-h-screen items-center justify-center p-6`}>
      <div className="w-full max-w-md">
        <ErrorState onRetry={reset} />
      </div>
    </div>
  )
}
