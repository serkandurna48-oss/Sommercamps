'use client'

import { useEffect } from 'react'
import { sentryDsn } from './lib/sentryScrub'

/** Last-resort boundary for errors no route-level error.tsx caught. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!sentryDsn()) return
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error)).catch(() => {})
  }, [error])

  return (
    <html lang="de">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '32rem', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Da ist etwas schiefgelaufen</h1>
        <p>Die Seite konnte nicht geladen werden. Bitte versuchen Sie es erneut.</p>
        <button type="button" onClick={() => reset()} style={{ padding: '0.5rem 1rem' }}>
          Erneut versuchen
        </button>
      </body>
    </html>
  )
}
