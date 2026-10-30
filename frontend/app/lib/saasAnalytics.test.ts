// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANALYTICS_CONSENT_KEY, captureSaasEvent, getAnalyticsConsent, saveAnalyticsConsent,
} from './saasAnalytics'

describe('CampsPilot opt-in analytics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_public_key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

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
})
