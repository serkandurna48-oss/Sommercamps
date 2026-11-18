// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANALYTICS_CONSENT_KEY, analyticsEnvironment, captureSaasEvent, getAnalyticsConsent, safeFieldKeys, saveAnalyticsConsent,
} from './saasAnalytics'

describe('CampsPilot opt-in analytics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_public_key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not send any event before explicit opt-in', () => {
    captureSaasEvent('camp_page_viewed', 'ksv-baunatal')
    expect(fetch).not.toHaveBeenCalled()
    expect(getAnalyticsConsent()).toBeNull()
  })

  it('sends only allowlisted non-identifying event fields after opt-in', () => {
    expect(saveAnalyticsConsent('accepted')).toBe(true)
    captureSaasEvent('camp_registration_succeeded', 'ksv-baunatal', 'herbstcamp', { result: 'registered' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e')
    const payload = JSON.parse(String(request?.body))
    expect(payload.api_key).toBe('phc_test_public_key')
    expect(payload.event).toBe('camp_registration_succeeded')
    expect(payload.properties).toEqual({
      $process_person_profile: false,
      surface: 'parent_flow',
      environment: 'development',
      organization: 'ksv-baunatal',
      camp: 'herbstcamp',
      result: 'registered',
    })
    expect(payload).not.toHaveProperty('parent_email')
    expect(request?.credentials).toBe('omit')
    expect(request?.referrerPolicy).toBe('no-referrer')
  })

  it('stops sending and deletes the session identifier after withdrawal', () => {
    saveAnalyticsConsent('accepted')
    captureSaasEvent('camp_registration_started', 'ksv-baunatal')
    expect(window.sessionStorage.length).toBe(1)
    saveAnalyticsConsent('rejected')
    captureSaasEvent('camp_registration_started', 'ksv-baunatal')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('rejected')
  })

  it('does not forward arbitrary query strings as organization identifiers', () => {
    saveAnalyticsConsent('accepted')
    captureSaasEvent('camp_page_viewed', 'attacker@example.org?token=secret')
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(payload.properties.organization).toBe('unknown')
  })

  it('reports failed field KEYS only, and nothing a club or parent typed', () => {
    saveAnalyticsConsent('accepted')
    captureSaasEvent('camp_registration_failed', 'ksv-baunatal', 'herbstcamp', {
      error_kind: 'validation',
      fields: ['parentPhone', 'childBirthDate', 'Hat Ihr Kind Maximiliane Allergien?', 'parentPhone', 'max.test@example.com'],
    })
    const body = String(vi.mocked(fetch).mock.calls[0][1]?.body)
    const { properties } = JSON.parse(body)
    expect(properties.fields).toEqual(['parentPhone', 'childBirthDate', 'other'])
    expect(properties.first_field).toBe('parentPhone')
    expect(properties.field_count).toBe(3)
    expect(body).not.toContain('Maximiliane')
    expect(body).not.toContain('max.test@example.com')
  })

  it('collapses any amount of unknown keys into one', () => {
    expect(safeFieldKeys(Array.from({ length: 200 }, (_, index) => `free text ${index}`))).toEqual(['other'])
  })

  it('never reveals that health information was entered', () => {
    // The health-consent check only fails when the allergy field is filled.
    expect(safeFieldKeys(['healthDataConsent', 'agb'])).toEqual(['other', 'agb'])
  })

  it('reports section numbers within range and drops anything else', () => {
    saveAnalyticsConsent('accepted')
    captureSaasEvent('camp_registration_section_completed', 'ksv-baunatal', 'herbstcamp', { section: 2 })
    captureSaasEvent('camp_registration_abandoned', 'ksv-baunatal', 'herbstcamp', { last_section: 0, sections_done: 0 })
    captureSaasEvent('camp_registration_section_completed', 'ksv-baunatal', 'herbstcamp', { section: 5 })
    const sent = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(sent[0].event).toBe('camp_registration_section_completed')
    expect(sent[0].properties.section).toBe(2)
    expect(sent[1].properties).toMatchObject({ last_section: 0, sections_done: 0 })
    expect(sent[2].properties).not.toHaveProperty('section')
  })

  it('does not send the new events without opt-in', () => {
    captureSaasEvent('camp_registration_section_completed', 'ksv-baunatal', 'herbstcamp', { section: 1 })
    captureSaasEvent('camp_registration_abandoned', 'ksv-baunatal', 'herbstcamp', { last_section: 1 })
    captureSaasEvent('camp_registration_failed', 'ksv-baunatal', 'herbstcamp', { error_kind: 'validation', fields: ['agb'] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('labels every event with the environment so staging never counts as production', () => {
    saveAnalyticsConsent('accepted')
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENVIRONMENT', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(analyticsEnvironment()).toBe('staging')
    captureSaasEvent('camp_page_viewed', 'ksv-baunatal')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    captureSaasEvent('camp_page_viewed', 'ksv-baunatal')
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENVIRONMENT', 'bogus')
    expect(analyticsEnvironment()).toBe('production')
    const environments = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)).properties.environment)
    expect(environments).toEqual(['staging', 'production'])
  })
})
