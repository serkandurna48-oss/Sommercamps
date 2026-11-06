// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SIDEBAR_STORAGE_KEY, parseSidebarPrefs } from './sidebarState'

const hooks = vi.hoisted(() => ({ pathname: '/pilot/demoverein/camps/sommer/zahlungen', pending: false, linkProps: [] as Array<Record<string, unknown>> }))
vi.mock('next/navigation', () => ({ usePathname: () => hooks.pathname }))
vi.mock('next/link', () => ({
  default: ({ children, prefetch, ...props }: { children: React.ReactNode; prefetch?: boolean; [k: string]: unknown }) => {
    hooks.linkProps.push({ ...props, prefetch })
    return <a {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: hooks.pending }),
}))
vi.mock('next/image', () => ({ default: (props: { alt: string }) => <span data-img={props.alt} /> }))
vi.mock('./logoutAction', () => ({ logoutAction: vi.fn() }))

const { default: AdminSidebar } = await import('./AdminSidebar')

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.localStorage.clear()
  hooks.pathname = '/pilot/demoverein/camps/sommer/zahlungen'
  hooks.pending = false
  hooks.linkProps.length = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const render = () => act(() => root.render(<AdminSidebar orgSlug="demoverein" orgName="Demoverein" orgLogoUrl={null} clubColor="#116644" />))
const sidebar = () => container.querySelector<HTMLElement>('aside.cp-sidebar')!
const label = (el: Element) => [...el.querySelectorAll('span:not([aria-hidden])')].map(s => s.textContent).join('').trim()

it('shows the grouped navigation with club identity and marks the parent area of a camp page', async () => {
  await render()
  expect(sidebar().textContent).toContain('Demoverein')
  expect([...sidebar().querySelectorAll('.cp-nav-group-head')].map(b => b.textContent)).toEqual(['Angebote', 'Teilnehmer'])
  const current = sidebar().querySelectorAll('[aria-current="page"]')
  expect(current).toHaveLength(1)
  expect(label(current[0])).toBe('Camps')
  expect(current[0].getAttribute('data-active')).toBe('true')
  expect([...sidebar().querySelectorAll('.cp-nav-foot a')].map(label)).toEqual(['Einstellungen', 'Hilfe'])
  expect(sidebar().querySelector('.cp-nav-foot button[type="submit"]')?.textContent).toBe('Abmelden')
})

/** PF1b: no prefetch storm on every menu render (each prefetch would hit /admin/me). */
it('never prefetches menu targets and confirms a click while the target loads', async () => {
  hooks.pending = true
  await render()
  const navLinks = hooks.linkProps.filter(p => typeof p.href === 'string' && String(p.href).startsWith('/pilot/'))
  expect(navLinks.length).toBeGreaterThanOrEqual(11)
  expect(navLinks.every(p => p.prefetch === false)).toBe(true)
  expect(sidebar().querySelector('.cp-nav-hint[data-pending="true"]')).not.toBeNull()
})

it('collapses groups and the whole sidebar and remembers both per browser', async () => {
  hooks.pathname = '/pilot/demoverein/dashboard'
  await render()
  const head = [...sidebar().querySelectorAll<HTMLButtonElement>('.cp-nav-group-head')].find(b => b.textContent === 'Teilnehmer')!
  expect(head.getAttribute('aria-expanded')).toBe('true')
  await act(() => head.click())
  expect(head.getAttribute('aria-expanded')).toBe('false')
  expect(document.getElementById(head.getAttribute('aria-controls')!)?.hidden).toBe(true)
  expect(parseSidebarPrefs(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).closedGroups).toEqual(['teilnehmer'])

  const toggle = sidebar().querySelector<HTMLButtonElement>('button[aria-label="Seitenleiste einklappen"]')!
  await act(() => toggle.click())
  expect(sidebar().getAttribute('data-collapsed')).toBe('true')
  expect(parseSidebarPrefs(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).collapsed).toBe(true)
  // Icon rail: labels stay available to screen readers, every group is reachable.
  expect(sidebar().querySelector('a[title="Mitglieder"] .sr-only')?.textContent).toBe('Mitglieder')
  expect(sidebar().querySelector('[hidden]')).toBeNull()
})

it('keeps the group with the current page open', async () => {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ collapsed: false, closedGroups: ['angebote'] }))
  await render()
  const head = [...sidebar().querySelectorAll<HTMLButtonElement>('.cp-nav-group-head')].find(b => b.textContent === 'Angebote')!
  expect(head.getAttribute('aria-expanded')).toBe('true')
  expect(head.getAttribute('aria-disabled')).toBe('true')
})

it('still works when storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  await render()
  // Without storage the toggle still works for this page view (in-memory fallback).
  const before = sidebar().getAttribute('data-collapsed')
  await act(() => sidebar().querySelector<HTMLButtonElement>('.cp-nav-brand-row button')!.click())
  expect(sidebar().getAttribute('data-collapsed')).toBe(before === 'true' ? 'false' : 'true')
})

it('opens the mobile drawer as a modal dialog with focus trap, Escape, overlay click and scroll lock', async () => {
  await render()
  const menu = container.querySelector<HTMLButtonElement>('header.cp-topbar button[aria-label="Menü öffnen"]')!
  expect(menu.className).toContain('cp-icon-btn')
  menu.focus()
  await act(() => menu.click())
  const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!
  expect(dialog).not.toBeNull()
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('Demoverein')
  expect(menu.getAttribute('aria-expanded')).toBe('true')
  expect(document.body.style.overflow).toBe('hidden')
  const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Menü schließen"]')!
  expect(document.activeElement).toBe(close)

  // Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last.
  const focusables = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
  focusables.at(-1)!.focus()
  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
  expect(document.activeElement).toBe(focusables[0])
  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })))
  expect(document.activeElement).toBe(focusables.at(-1))

  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(container.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(menu)

  await act(() => menu.click())
  await act(() => container.querySelector<HTMLElement>('[data-testid="drawer-overlay"]')!.click())
  expect(container.querySelector('[role="dialog"]')).toBeNull()

  // Choosing a destination closes the drawer.
  await act(() => menu.click())
  await act(() => [...container.querySelectorAll<HTMLAnchorElement>('[role="dialog"] a')].find(a => label(a) === 'Zahlungen')!.click())
  expect(container.querySelector('[role="dialog"]')).toBeNull()
})
