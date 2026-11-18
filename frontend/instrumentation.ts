import type { Instrumentation } from 'next'
import { sentryDsn } from './app/lib/sentryScrub'

export async function register(): Promise<void> {
  if (!sentryDsn()) return
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.server.config')
  }
}

// Reports errors thrown while rendering on the server (route pattern, method).
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!sentryDsn()) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureRequestError(...args)
  } catch {
    // Monitoring must never turn one error into two.
  }
}
