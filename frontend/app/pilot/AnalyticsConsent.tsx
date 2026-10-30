'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { captureSaasEvent, getAnalyticsConsent, saveAnalyticsConsent } from '../lib/saasAnalytics'

const OPEN_EVENT = 'campspilot:open-analytics-settings'

/**
 * Separate, optional consent for PostHog EU.
 * The registration form's mandatory privacy consent is NOT analytics consent.
 */
export default function AnalyticsConsentBanner() {
  const pathname = usePathname()
  const match = pathname?.match(/^\/pilot\/([a-z0-9-]+)(?:\/(?:datenschutz))?\/?$/)
  const orgSlug = match?.[1] ?? null
  const isLanding = Boolean(pathname?.match(/^\/pilot\/[a-z0-9-]+\/?$/))
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

  if (!hydrated || !orgSlug || !visible) return null

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
    <aside
      role="region"
      aria-label="Freiwillige Nutzungsanalyse"
      data-testid="analytics-consent"
      style={{
        // In document flow, never cover the registration CTA or form fields.
        position: 'relative', zIndex: 1, boxSizing: 'border-box',
        width: 'calc(100% - 32px)', maxWidth: 650, margin: '12px auto',
        background: '#fff', color: '#172b20',
        border: '1px solid #cdd9d0', borderRadius: 12, padding: '18px 20px',
        boxShadow: '0 3px 12px rgba(0,0,0,.09)', fontFamily: 'Arial, sans-serif',
        lineHeight: 1.5, fontSize: 14,
      }}
    >
      <p style={{ fontWeight: 700, margin: '0 0 6px' }}>Freiwillige Nutzungsanalyse</p>
      <p style={{ margin: '0 0 12px' }}>
        Dürfen wir anonym erfassen, welche Camp-Seiten besucht werden und ob Anmeldungen
        begonnen oder abgeschlossen werden? Wir verwenden PostHog (EU), ohne Namen,
        E-Mail-Adressen, Gesundheitsdaten, Formulareingaben oder Sitzungsaufnahmen.
        Die Anmeldung funktioniert auch ohne Zustimmung.{' '}
        <a href={`/pilot/${orgSlug}/datenschutz#ds-8`} style={{ textDecoration: 'underline' }}>
          Datenschutz
        </a>
      </p>
      {storageError && <p role="alert" style={{ color: '#9f2020' }}>
        Die Einstellung konnte nicht gespeichert werden. Es werden keine Analysedaten übertragen.
      </p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          onClick={() => choose('rejected')}
          style={{ padding: '10px 15px', border: '1px solid #647369', borderRadius: 8, background: 'white', color: '#172b20', cursor: 'pointer' }}
        >
          Nur notwendige
        </button>
        <button
          type="button"
          onClick={() => choose('accepted')}
          style={{ padding: '10px 15px', border: 0, borderRadius: 8, background: '#175d3d', color: 'white', fontWeight: 700, cursor: 'pointer' }}
        >
          Analyse erlauben
        </button>
      </div>
    </aside>
  )
}

export function AnalyticsSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      style={{ padding: '8px 12px', border: '1px solid currentColor', borderRadius: 6, cursor: 'pointer' }}
    >
      Einwilligung zur Nutzungsanalyse ändern
    </button>
  )
}
