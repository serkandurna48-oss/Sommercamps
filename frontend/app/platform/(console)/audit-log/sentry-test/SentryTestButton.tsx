'use client'

import { useState } from 'react'
import { SentryTestError, sentryDsn, sentryEnvironment } from '../../../../lib/sentryScrub'

export default function SentryTestButton() {
  const [state, setState] = useState<'idle' | 'sent' | 'off'>('idle')

  const fire = () => {
    if (!sentryDsn()) {
      setState('off')
      return
    }
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.captureException(new SentryTestError())
        setState('sent')
      })
      .catch(() => setState('off'))
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={fire} className="cp-focus rounded border px-4 py-2 text-sm font-medium">
        Testfehler senden
      </button>
      <p role="status" className="mt-3 text-sm">
        {state === 'sent' && `Testfehler gesendet (Umgebung: ${sentryEnvironment()}).`}
        {state === 'off' && 'Fehlerüberwachung ist in dieser Umgebung nicht eingerichtet (kein DSN).'}
      </p>
    </div>
  )
}
