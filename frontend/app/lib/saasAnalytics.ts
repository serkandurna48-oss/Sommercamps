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
  | 'camp_registration_section_completed'
  | 'camp_registration_abandoned'

export type EventDetails = {
  result?: 'registered' | 'waitlist' | 'other'
  error_kind?: 'validation' | 'api' | 'network'
  status_code?: number
  /** Form section that just became complete (1-4). */
  section?: number
  /** How many sections were complete in order from the top when the parent left (0-4). */
  last_section?: number
  /** Number of complete sections at that moment. */
  sections_done?: number
  /** Field KEYS that failed validation - never labels, values or free text. */
  fields?: readonly string[]
}

/**
 * The only field identifiers that may leave the browser. They are our own
 * code names for form fields. Anything else (in particular the free-text
 * keys of club-defined extra questions) is reported as 'other'.
 */
export const ANALYTICS_FIELD_KEYS = [
  'childFirstName', 'childLastName', 'childBirthDate',
  'parentName', 'parentEmail', 'parentPhone',
  'billingStreet', 'billingPostalCode', 'billingCity',
  'emergencyPhone', 'agb', 'privacy',
  'extra_question', 'payment_method',
] as const
// Deliberately NOT listed: 'healthDataConsent'. That check only fails when a
// parent typed something into the allergy field, so the key alone would reveal
// that health information exists for this child (GDPR Art. 9). It is sent as 'other'.
const FIELD_KEY_SET: ReadonlySet<string> = new Set(ANALYTICS_FIELD_KEYS)

export function safeFieldKeys(fields: readonly string[]): string[] {
  // At most every listed key plus 'other'; duplicates collapse.
  return [...new Set(fields.map((field) => (FIELD_KEY_SET.has(field) ? field : 'other')))]
}

function sectionNumber(value: unknown, min: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= 4 ? value : null
}

/** production | staging | development. Vercel previews (staging) must never
 * be counted as production; the PostHog funnel filters on this property. */
export function analyticsEnvironment(): 'production' | 'staging' | 'development' {
  const explicit = (process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT ?? '').trim().toLowerCase()
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit
  const vercel = (process.env.NEXT_PUBLIC_VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'staging'
  return 'development'
}

/** Analytics stays fully off (no banner, no privacy text) until a PostHog key
 * is configured for the deployment. Activate per environment after the DPA. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
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

    const properties: Record<string, string | number | boolean | string[]> = {
      $process_person_profile: false,
      surface: 'parent_flow',
      environment: analyticsEnvironment(),
      organization: publicSlug(orgSlug),
    }
    if (campSlug) properties.camp = publicSlug(campSlug)
    if (details.result) properties.result = details.result
    if (details.error_kind) properties.error_kind = details.error_kind
    if (typeof details.status_code === 'number' && details.status_code >= 0 && details.status_code <= 599) {
      properties.status_code = details.status_code
    }
    const section = sectionNumber(details.section, 1)
    if (section !== null) properties.section = section
    const lastSection = sectionNumber(details.last_section, 0)
    if (lastSection !== null) properties.last_section = lastSection
    const sectionsDone = sectionNumber(details.sections_done, 0)
    if (sectionsDone !== null) properties.sections_done = sectionsDone
    if (details.fields && details.fields.length > 0) {
      const fields = safeFieldKeys(details.fields)
      properties.fields = fields
      properties.first_field = fields[0]
      properties.field_count = fields.length
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
