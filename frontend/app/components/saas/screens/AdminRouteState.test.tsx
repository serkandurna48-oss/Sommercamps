// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminRouteState from './AdminRouteState'
import { OrganizationProvider } from '../shell/OrganizationContext'

let pathname = '/pilot/demo/dashboard'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>, useLinkStatus: () => ({ pending: false }) }))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

it.each(['dashboard', 'zahlungen', 'warteliste', 'aufgaben', 'konfiguration', 'anmeldungen', 'camps/new', 'camps/sommer', 'camps/sommer/zahlungen', 'camps/sommer/warteliste', 'camps/sommer/aufgaben', 'camps/sommer/konfiguration'])('keeps identity and correct parent navigation while loading or failing on %s', path => {
  pathname = `/pilot/demo/${path}`
  for (const reset of [undefined, vi.fn()]) {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<OrganizationProvider org={{ name: 'Testverein', logo_url: null, primary_color: '#116644' }}><AdminRouteState reset={reset} /></OrganizationProvider>)
    expect(container.querySelector('header')?.textContent).toContain('Testverein')
    expect(container.querySelector('header button')?.textContent).toBe('Abmelden')
    const back = [...container.querySelectorAll('header a')].find(a => a.textContent?.trim() === '← Zurück')
    if (path === 'dashboard') expect(back).toBeUndefined()
    else expect(back?.getAttribute('href')).toBe(path.startsWith('camps/sommer/') ? '/pilot/demo/camps/sommer' : '/pilot/demo/dashboard')
    expect(container.querySelector('nav a')?.textContent).toBe(path.startsWith('camps/sommer') ? 'Teilnehmer' : 'Übersicht')
    expect(container.querySelector(reset ? 'main button' : '[role="status"]')).not.toBeNull()
  }
})
