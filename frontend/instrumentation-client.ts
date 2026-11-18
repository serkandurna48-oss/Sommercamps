// Browser error monitoring. Without NEXT_PUBLIC_SENTRY_DSN nothing is loaded.
// Privacy rules: app/lib/sentryScrub.ts.
import { sentryDsn, sentryOptions } from './app/lib/sentryScrub'

if (sentryDsn()) {
  // Loaded as its own chunk so pages stay unchanged where monitoring is off.
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        ...sentryOptions(),
        // The complete list. No replay, tracing, session counting, console or click capture.
        integrations: [
          Sentry.globalHandlersIntegration(),
          Sentry.linkedErrorsIntegration(),
          Sentry.dedupeIntegration(),
          Sentry.httpContextIntegration(),
          Sentry.breadcrumbsIntegration({ dom: false, sentry: false, fetch: true, xhr: true, history: true }),
        ],
      })
    })
    .catch(() => { /* Monitoring must never break the page. */ })
}
