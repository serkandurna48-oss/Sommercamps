// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import AnalyticsConsentBanner from './AnalyticsConsent'

afterEach(() => { vi.unstubAllEnvs(); document.body.innerHTML = ''; window.localStorage.clear() })

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  await act(async () => { createRoot(host).render(<AnalyticsConsentBanner orgSlug="demo" isLanding />) })
  await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(null))) })
  return host
}

it('zeigt das Banner im Vereinsstil mit gleichwertigen Knöpfen, wenn ein Schlüssel gesetzt ist', async () => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
  const host = await mount()
  const banner = host.querySelector('.cp-consent')
  expect(banner).not.toBeNull()
  expect(banner?.getAttribute('style')).toBeNull()
  expect([...host.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Ablehnen', 'Erlauben'])
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/pilot/demo/datenschutz#ds-8')
})

it('bleibt ohne Schlüssel unsichtbar', async () => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
  const host = await mount()
  expect(host.querySelector('.cp-consent')).toBeNull()
})
