/**
 * Privacy-first, opt-in analytics for the SaaS parent flow.
 * Never pass registration payloads, form fields, names, health information,
 * emails, tokens, URLs or user IDs to this module.
 *
 * PostHog EU ingest: https://posthog.com/docs/api/capture
 * No SDK/autocapture, cookies or session replay are used.
 */
export const ANALYTICS_CONSENT_KEY = 'campspilot-analytics-consent-v1'
const SESSION_KEY = 'campspilot-analytics-session-v1'
const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/i/v0/e'

export type AnalyticsConsent = 'accepted' | 'rejected'
export type SaaSEvent =
  | 'camp_page_viewed'
  | 'camp_registration_started'
  | 'camp_registration_succeeded'
  | 'camp_registration_failed'

export type EventDetails = {
  result?: 'registered' | 'waitlist' | 'other'
  error_kind?: 'validation' | 'api' | 'network'
  status_code?: number
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    return stored === 'accepted' || stored === 'rejected' ? stored : null
  } catch {
    return null
  }
}

export function saveAnalyticsConsent(consent: AnalyticsConsent): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent)
    if (consent === 'rejected') window.sessionStorage.removeItem(SESSION_KEY)
    return true
  } catch {
    return false
  }
}

function publicSlug(value: string): string {
  // Slugs are public identifiers, never names or untrusted query values.
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) ? value : 'unknown'
}

/**
 * Best-effort only: analytics must never slow, reject, or break registration.
 * Called exclusively after separate, optional analytics consent.
 */
export function captureSaasEvent(
  event: SaaSEvent,
  orgSlug: string,
  campSlug?: string,
  details: EventDetails = {},
): void {
  if (getAnalyticsConsent() !== 'accepted') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || typeof window === 'undefined') return

  try {
    let sessionId = window.sessionStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      sessionId = typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `session-${Math.random().toString(36).slice(2)}-${Date.now()}`
      window.sessionStorage.setItem(SESSION_KEY, sessionId)
    }

    const properties: Record<string, string | number | boolean> = {
      $process_person_profile: false,
      surface: 'parent_flow',
      organization: publicSlug(orgSlug),
    }
    if (campSlug) properties.camp = publicSlug(campSlug)
    if (details.result) properties.result = details.result
    if (details.error_kind) properties.error_kind = details.error_kind
    if (typeof details.status_code === 'number' && details.status_code >= 0 && details.status_code <= 599) {
      properties.status_code = details.status_code
    }

    void fetch(POSTHOG_CAPTURE_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        distinct_id: sessionId,
        event,
        properties,
      }),
    }).catch(() => { /* Analytics is never a critical path. */ })
  } catch {
    // Storage, network and tracking failures must never affect users.
  }
}
