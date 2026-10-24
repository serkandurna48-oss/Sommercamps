import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

let linkPending = false
const capturedLinkProps: Array<Record<string, unknown>> = []

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demoverein/dashboard' }))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => {
    capturedLinkProps.push({ ...props })
    return <a {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: linkPending }),
}))

const { default: BandTabs } = await import('./BandTabs')

const tabs = [
  { label: 'Übersicht', href: '/pilot/demoverein/dashboard', icon: 'board' as const },
  { label: 'Zahlungen', href: '/pilot/demoverein/zahlungen', icon: 'coin' as const },
]

beforeEach(() => {
  linkPending = false
  capturedLinkProps.length = 0
})

it('markiert den aktuellen Bereich', () => {
  const html = renderToStaticMarkup(<BandTabs tabs={tabs} brandColor="#0B6E4F" />)
  expect(html).toContain('aria-current="page"')
})

it('zeigt keine Klick-Rückmeldung, solange nichts lädt', () => {
  const html = renderToStaticMarkup(<BandTabs tabs={tabs} brandColor="#0B6E4F" />)
  expect(html).toContain('cp-tab-hint')
  expect(html).not.toContain('data-pending="true"')
})

/** Gemessen (PRO-60): ein Bereichswechsel veränderte bis zu 2,1 s lang nichts
 * am Bildschirm. Die Rückmeldung muss am geklickten Tab erscheinen, solange
 * die Zielseite noch lädt — und das Element ist immer im Markup, damit das
 * Einblenden nichts verschiebt. */
it('bestätigt den Klick, während die Zielseite noch lädt', () => {
  linkPending = true
  const html = renderToStaticMarkup(<BandTabs tabs={tabs} brandColor="#0B6E4F" />)
  expect(html).toContain('data-pending="true"')
})

/** PF1b: Prefetch auf false setzen verhindert, dass jeder Menüklick ~20
 * gleichzeitige Backend-Anfragen auslöst (Layout + alle Tabs laden /admin/me). */
it('alle Menü-Links im Band haben prefetch={false}', () => {
  renderToStaticMarkup(<BandTabs tabs={tabs} brandColor="#0B6E4F" />)
  expect(capturedLinkProps.length).toBe(tabs.length)
  expect(capturedLinkProps.every(p => p.prefetch === false)).toBe(true)
})
