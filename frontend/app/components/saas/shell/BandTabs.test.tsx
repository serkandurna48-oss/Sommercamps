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

const { default: BandTabs, activeTabHref } = await import('./BandTabs')
const { orgTabs } = await import('../navTabs')

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

it('sieben Bereiche: sieben gleich breite Spalten, Kurzbeschriftung unter md, volle Beschriftung für Screenreader', () => {
  const seven = ['Übersicht', 'Zahlungen', 'Warteliste', 'Aufgaben', 'Trainings', 'Mitglieder', 'Einstellungen'].map((label, i) => ({
    label, shortLabel: ['Start', 'Zahlung', 'Warten', 'Aufgaben', 'Training', 'Mitglied', 'Optionen'][i], href: `/pilot/demoverein/t${i}`,
  }))
  const html = renderToStaticMarkup(<BandTabs tabs={seven} brandColor="#0B6E4F" />)
  expect(html).toContain('grid-template-columns:repeat(7, minmax(0, 1fr))')
  expect(html).toContain('data-tab-count="7"')
  expect(html).not.toContain('grid-cols-[1fr_1fr_1fr_1fr_1.3fr]')
  expect(html).toContain('aria-hidden="true">Optionen</span>')
  expect(html).toContain('>Einstellungen</span>')
})

it('acht Bereiche (mit Spieler): acht Spalten in einer Zeile, nur Kurzbeschriftungen unter md', () => {
  const eight = orgTabs('demoverein')
  expect(eight).toHaveLength(8)
  const html = renderToStaticMarkup(<BandTabs tabs={eight} brandColor="#0B6E4F" />)
  expect(html).toContain('grid-template-columns:repeat(8, minmax(0, 1fr))')
  expect(html).toContain('data-tab-count="8"')
  expect(html).toContain('aria-hidden="true">Spieler</span>')
  expect(html).toContain('href="/pilot/demoverein/spieler"')
})

it('fünf Bereiche behalten ihre Spaltenzahl ohne Kurzbeschriftung', () => {
  const html = renderToStaticMarkup(<BandTabs tabs={tabs} brandColor="#0B6E4F" />)
  expect(html).toContain('grid-template-columns:repeat(2, minmax(0, 1fr))')
})

it('markiert auf Unterseiten den übergeordneten Bereich (längster Präfix)', () => {
  const org = orgTabs('demoverein').map(tab => tab.href)
  expect(activeTabHref('/pilot/demoverein/trainings/abc', org)).toBe('/pilot/demoverein/trainings')
  expect(activeTabHref('/pilot/demoverein/spieler/123', org)).toBe('/pilot/demoverein/spieler')
  expect(activeTabHref('/pilot/demoverein/spielerliste', org)).toBeUndefined()
  expect(activeTabHref('/pilot/demoverein/einrichtung', org)).toBeUndefined()
  const camp = ['/pilot/v/camps/c', '/pilot/v/camps/c/zahlungen']
  expect(activeTabHref('/pilot/v/camps/c/zahlungen', camp)).toBe('/pilot/v/camps/c/zahlungen')
  expect(activeTabHref('/pilot/v/camps/c', camp)).toBe('/pilot/v/camps/c')
})
