// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminRouteState from './AdminRouteState'
import { OrganizationProvider } from '../shell/OrganizationContext'

let pathname = '/pilot/demo/dashboard'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>, useLinkStatus: () => ({ pending: false }) }))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

it.each(['dashboard', 'zahlungen', 'warteliste', 'aufgaben', 'konfiguration', 'anmeldungen', 'camps', 'camps/new', 'camps/sommer', 'camps/sommer/zahlungen', 'camps/sommer/warteliste', 'camps/sommer/aufgaben', 'camps/sommer/konfiguration'])('keeps the page title and correct parent navigation while loading or failing on %s', path => {
  pathname = `/pilot/demo/${path}`
  for (const reset of [undefined, vi.fn()]) {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<OrganizationProvider org={{ name: 'Testverein', logo_url: null, primary_color: '#116644' }}><AdminRouteState reset={reset} /></OrganizationProvider>)
    // Club identity and the sidebar stay in the layout around this fallback.
    expect(container.querySelector('header.cp-page-head h1')?.textContent).toBeTruthy()
    const back = container.querySelector('header a.cp-back-link')
    const campLevel = path.startsWith('camps/sommer')
    if (campLevel || path === 'camps/new') expect(back?.getAttribute('href')).toBe('/pilot/demo/camps')
    else expect(back).toBeNull()
    const tabs = [...container.querySelectorAll('header nav a')].map(a => a.firstChild?.textContent)
    expect(tabs).toEqual(campLevel ? ['Teilnehmer', 'Zahlungen', 'Warteliste', 'Aufgaben', 'Einstellungen'] : [])
    expect(container.querySelector(reset ? 'main button' : '[role="status"]')).not.toBeNull()
  }
})
