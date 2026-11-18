/**
 * Error monitoring (Sentry) without personal data.
 *
 * The parent flow handles children's data (GDPR Art. 9). Sentry may only see
 * technical facts: error type, stack frames, route and browser. Everything
 * that can carry form content is removed here, on top of the SDK switches in
 * sentryOptions(): request bodies, cookies, query strings, headers, user
 * context, breadcrumb payloads, free-text messages of generic errors, and
 * UUIDs (booking tokens) or mail addresses in any remaining text.
 *
 * No session replay, no tracing, no session counting, no cookies or storage.
 * The SDK's default integrations are switched off; only the ones listed in
 * instrumentation-client.ts run. `dataCollection` is the v11 switch for what
 * the SDK gathers by itself (the older `sendDefaultPii` no longer exists).
 * Mirrors backend_saas/app/monitoring.py - keep both in sync.
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const MAX_TEXT = 300
export const REMOVED = '[removed]'

/** Messages of these types are written by the JS engine or the bundler and
 * name code identifiers. Every other message is dropped - including
 * SyntaxError, whose text quotes the input ("Unexpected token 'M', "Maxi"..."). */
const ENGINE_ERROR_TYPES = new Set(['TypeError', 'ReferenceError', 'RangeError', 'ChunkLoadError'])
/** Breadcrumbs that describe navigation and network calls. Click breadcrumbs
 * are not allowed: the SDK copies aria-label/title/name of the clicked element
 * into them, and admin rows carry names there ("Mia Muster, Details"). */
const BREADCRUMB_CATEGORIES = new Set(['navigation', 'fetch', 'xhr'])
const CONTEXT_KEYS = new Set(['browser', 'os', 'device', 'runtime', 'trace'])
const NEXT_CONTEXT_KEYS = ['router_kind', 'router_path', 'route_type'] as const
const TEST_ERROR_TYPE = 'SentryTestError'

export function maskText(value: string): string {
  const masked = value.replace(UUID_RE, '[id]').replace(EMAIL_RE, '[mail]')
  return masked.length <= MAX_TEXT ? masked : `${masked.slice(0, MAX_TEXT)}…`
}

export function stripUrl(url: string): string {
  return maskText(url.split('?')[0].split('#')[0])
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (!crumb.category || !BREADCRUMB_CATEGORIES.has(crumb.category)) return null
  const data = crumb.data
  const kept: Record<string, string | number> = {}
  if (data) {
    if (typeof data.method === 'string') kept.method = data.method
    if (typeof data.status_code === 'number') kept.status_code = data.status_code
    for (const key of ['url', 'from', 'to'] as const) {
      if (typeof data[key] === 'string') kept[key] = stripUrl(data[key])
    }
  }
  // No message: free text is never needed for these categories.
  return {
    type: crumb.type,
    category: crumb.category,
    level: crumb.level,
    timestamp: crumb.timestamp,
    ...(Object.keys(kept).length > 0 ? { data: kept } : {}),
  }
}

function scrubContexts(contexts: NonNullable<ErrorEvent['contexts']>): NonNullable<ErrorEvent['contexts']> {
  const kept: NonNullable<ErrorEvent['contexts']> = {}
  for (const [key, value] of Object.entries(contexts)) {
    if (CONTEXT_KEYS.has(key) && value) kept[key] = value
  }
  // The Next.js context holds the real request path (with booking token and
  // query string). Keep only the route pattern, e.g. /pilot/[org]/buchung/[token].
  const next = contexts.nextjs
  if (next) {
    const route: Record<string, string> = {}
    for (const key of NEXT_CONTEXT_KEYS) {
      if (typeof next[key] === 'string') route[key] = maskText(next[key])
    }
    kept.nextjs = route
  }
  return kept
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  try {
    if (event.request) {
      const url = typeof event.request.url === 'string' ? stripUrl(event.request.url) : undefined
      const agent = event.request.headers?.['User-Agent'] ?? event.request.headers?.['user-agent']
      event.request = {
        ...(url ? { url } : {}),
        ...(event.request.method ? { method: event.request.method } : {}),
        ...(agent ? { headers: { 'User-Agent': maskText(String(agent)) } } : {}),
      }
    }
    delete event.user
    delete event.extra
    delete event.tags
    if (event.contexts) event.contexts = scrubContexts(event.contexts)

    for (const item of event.exception?.values ?? []) {
      const keep = item.type === TEST_ERROR_TYPE || (item.type !== undefined && ENGINE_ERROR_TYPES.has(item.type))
      item.value = keep && typeof item.value === 'string' ? maskText(item.value) : REMOVED
      for (const frame of item.stacktrace?.frames ?? []) {
        delete frame.vars
        delete frame.pre_context
        delete frame.context_line
        delete frame.post_context
        if (typeof frame.filename === 'string') frame.filename = stripUrl(frame.filename)
        if (typeof frame.abs_path === 'string') frame.abs_path = stripUrl(frame.abs_path)
      }
    }
    if (typeof event.transaction === 'string') event.transaction = maskText(event.transaction)
    if (typeof event.message === 'string') event.message = REMOVED
    if (event.logentry) event.logentry = { message: REMOVED }
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs
        .map(scrubBreadcrumb)
        .filter((crumb): crumb is Breadcrumb => crumb !== null)
    }
    return event
  } catch {
    // Never send an event that could not be cleaned.
    return null
  }
}

export function sentryDsn(): string {
  return (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim()
}

/** production | staging | development - Vercel previews count as staging. */
export function sentryEnvironment(): string {
  const explicit = (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? '').trim().toLowerCase()
  if (explicit) return explicit
  const vercel = (process.env.NEXT_PUBLIC_VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'staging'
  return 'development'
}

/** Shared by the browser, server and edge init. Callers only initialise the
 * SDK when sentryDsn() is set; `enabled` is a second guard. */
export function sentryOptions() {
  const dsn = sentryDsn()
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: sentryEnvironment(),
    release: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? '').trim() || undefined,
    // Nothing is collected automatically: no IP inference, cookies, headers,
    // bodies, query strings, frame variables or source lines.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    // No tracing (no sample rate set) and no trace headers on our API calls.
    tracePropagationTargets: [],
    // Explicit allowlist instead of the SDK defaults, which change between versions.
    defaultIntegrations: false as const,
    maxBreadcrumbs: 30,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}

/** Thrown on purpose from the platform console to prove delivery. */
export class SentryTestError extends Error {
  constructor() {
    super('CampsPilot Sentry test (frontend)')
    this.name = TEST_ERROR_TYPE
  }
}
