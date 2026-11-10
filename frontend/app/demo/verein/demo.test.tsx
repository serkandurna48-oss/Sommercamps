// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistrationCreated } from '../../lib/saasApi'
import RegistrationFormScreen from '../../pilot/[org]/RegistrationFormScreen'
import DoneScreen from '../../pilot/[org]/DoneScreen'
import DemoClubPage, { metadata } from './page'
import { demoCamps, demoOrganization } from './demoClub'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/demo/verein' }))
vi.mock('../../pilot/[org]/publicFonts', () => ({ publicFontClassName: () => '' }))
vi.mock('../../pilot/[org]/GrainOverlay', () => ({ default: () => null }))
vi.mock('../../pilot/[org]/motion', () => ({ useParentFlowMotion: () => {} }))

const fetchMock = vi.fn(() => { throw new Error('Unexpected network request') })
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear() })
afterEach(() => vi.unstubAllGlobals())

describe('/demo/verein (Seite)', () => {
  it('ist noindex und als Demo mit Beispieldaten gekennzeichnet', async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    const html = renderToStaticMarkup(await DemoClubPage({}))
    expect(html).toContain('Demo – Beispieldaten')
    expect(html).toContain(demoOrganization.name)
    expect(html).not.toContain('application/ld+json')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('zeigt zwei erfundene Camps in der Zukunft und verlinkt keine echten Vereinsseiten', async () => {
    const camps = demoCamps()
    expect(camps).toHaveLength(2)
    const today = new Date().toISOString().slice(0, 10)
    for (const camp of camps) expect(camp.start_date > today).toBe(true)
    const html = renderToStaticMarkup(await DemoClubPage({}))
    for (const camp of camps) expect(html).toContain(camp.title)
    expect(html).not.toMatch(/href="\/pilot\//)
  })

  it('nutzt die echten Seitenbausteine des Elternbereichs (Camp-Karten und Fußzeile)', async () => {
    const html = renderToStaticMarkup(await DemoClubPage({}))
    expect(html).toContain('cp-public')
    expect(html).toContain('class="foot"')
  })
})

describe('/demo/verein (Anmeldeformular)', () => {
  let host: HTMLDivElement
  let root: Root
  const onSubmitted = vi.fn()
  const camp = demoCamps()[0]

  beforeEach(async () => {
    onSubmitted.mockClear()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    HTMLElement.prototype.scrollIntoView = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(
      <RegistrationFormScreen demo orgSlug={demoOrganization.slug} orgName={demoOrganization.name} hasBankDetails camp={camp} onBack={() => {}} onSubmitted={onSubmitted} />,
    ))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('schickt das Formular nie an eine API und meldet lokal Erfolg', async () => {
    const values = ['Mia', 'Muster', '05072017', 'Eva Muster', 'eva@example.com', '0561 1234', '0561 5678', '']
    await act(async () => {
      host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])').forEach((input, index) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, values[index])
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      host.querySelectorAll<HTMLInputElement>('input[required][type=checkbox]').forEach(input => input.click())
    })
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    const [result, child, email] = onSubmitted.mock.calls[0] as [RegistrationCreated, string, string]
    expect(result.registration_token).toBe('demo-token')
    expect(child).toBe('Mia')
    expect(email).toBe('eva@example.com')
  })

  it('verlinkt Rechtstexte nicht auf nicht vorhandene Vereinsseiten', () => {
    const hrefs = [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs.filter(h => h?.startsWith('/pilot/'))).toEqual([])
  })
})

describe('/demo/verein (Bestätigung)', () => {
  const result: RegistrationCreated = { registration_token: 'demo-token', status: 'registered', payment_status: 'open', payment_reference: 'CP-DEMO0001' }
  const render = (demo: boolean) => {
    return renderToStaticMarkup(<DoneScreen demo={demo} org={demoOrganization} camp={demoCamps()[0]} result={result} childName="Mia" parentEmail="eva@example.com" onBackToOrg={() => {}} />)
  }

  it('zeigt den normalen Erfolgsbildschirm mit dem Hinweis „Demo: nichts wurde gespeichert“', () => {
    const html = render(true)
    expect(html).toContain('Anmeldung eingegangen')
    expect(html).toContain('Demo: nichts wurde gespeichert')
  })

  it('zeigt den Hinweis in der echten Seite nie', () => {
    expect(render(false)).not.toContain('Demo: nichts wurde gespeichert')
  })
})
