'use client'

import { useEffect, useState } from 'react'
import { captureSaasEvent, getAnalyticsConsent, isAnalyticsEnabled, saveAnalyticsConsent } from '../lib/saasAnalytics'

const OPEN_EVENT = 'campspilot:open-analytics-settings'

/**
 * Separate, optional consent for PostHog EU.
 * The registration form's mandatory privacy consent is NOT analytics consent.
 */
/** Rendered inside the club's themed wrapper (landing page and legal pages). */
export default function AnalyticsConsentBanner({ orgSlug, isLanding = false }: { orgSlug: string, isLanding?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    // Read browser storage after hydration; avoid synchronous state updates
    // within effects, which violate React 19's set-state-in-effect rule.
    if (!orgSlug) return
    const frame = window.requestAnimationFrame(() => {
      setHydrated(true)
      const choice = getAnalyticsConsent()
      setVisible(choice === null)
      if (choice === 'accepted' && isLanding) captureSaasEvent('camp_page_viewed', orgSlug)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [orgSlug, isLanding])

  useEffect(() => {
    const open = () => {
      setStorageError(false)
      setVisible(true)
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  if (!isAnalyticsEnabled() || !hydrated || !orgSlug || !visible) return null

  const choose = (value: 'accepted' | 'rejected') => {
    if (!saveAnalyticsConsent(value)) {
      setStorageError(true)
      return
    }
    setStorageError(false)
    setVisible(false)
    if (value === 'accepted' && isLanding) captureSaasEvent('camp_page_viewed', orgSlug)
  }

  return (
    <aside role="region" aria-labelledby="cp-consent-title" data-testid="analytics-consent" className="cp-consent">
      <p id="cp-consent-title" className="cp-consent-title">Nutzungsanalyse erlauben?</p>
      <p className="cp-consent-text">
        Freiwillig und datensparsam, ohne Namen oder Formulardaten.{' '}
        <a href={`/pilot/${orgSlug}/datenschutz#ds-8`}>Mehr dazu</a>
      </p>
      {storageError && <p role="alert" className="cp-consent-error">
        Die Einstellung konnte nicht gespeichert werden. Es werden keine Analysedaten übertragen.
      </p>}
      <div className="cp-consent-actions">
        <button type="button" className="cp-consent-btn" onClick={() => choose('rejected')}>Ablehnen</button>
        <button type="button" className="cp-consent-btn cp-consent-btn-primary" onClick={() => choose('accepted')}>Erlauben</button>
      </div>
    </aside>
  )
}

export function AnalyticsSettingsButton() {
  return (
    <button
      type="button"
      className="cp-consent-settings"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      Einwilligung zur Nutzungsanalyse ändern
    </button>
  )
}
