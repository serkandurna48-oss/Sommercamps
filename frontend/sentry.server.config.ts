// Server and edge error monitoring. Imported by instrumentation.ts only when a DSN is set.
import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './app/lib/sentryScrub'

// No default integrations: errors are reported explicitly through onRequestError.
Sentry.init({ ...sentryOptions(), integrations: [] })
