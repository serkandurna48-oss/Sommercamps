// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PublishToggle from './PublishToggle'
import { setOrganizationPublishedAction } from '../actions/configActions'

vi.mock('../actions/configActions', () => ({ setOrganizationPublishedAction: vi.fn() }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(setOrganizationPublishedAction).mockResolvedValue({ error: null })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('explains the consequence and cancels withdrawal when confirmation is declined', async () => {
  await act(() => root.render(<PublishToggle orgSlug="review" published />))
  expect(container.querySelector('button')!.textContent).toBe('Vereinsseite zurückziehen')
  await act(async () => container.querySelector('button')!.click())
  expect(window.confirm).toHaveBeenCalledWith('Vereinsseite zurückziehen?\nEltern können dann keine Camps mehr sehen oder buchen.')
  expect(setOrganizationPublishedAction).not.toHaveBeenCalled()
})

it('withdraws only after confirmation and displays a server failure', async () => {
  vi.mocked(window.confirm).mockReturnValue(true)
  vi.mocked(setOrganizationPublishedAction).mockResolvedValue({ error: 'Bitte erneut versuchen.' })
  await act(() => root.render(<PublishToggle orgSlug="review" published />))
  await act(async () => container.querySelector('button')!.click())
  expect(setOrganizationPublishedAction).toHaveBeenCalledWith('review', false, { error: null }, expect.any(FormData))
  expect(container.querySelector('[role="alert"]')!.textContent).toBe('Bitte erneut versuchen.')
  vi.mocked(window.confirm).mockReturnValue(false)
  await act(async () => container.querySelector('button')!.click())
  expect(setOrganizationPublishedAction).toHaveBeenCalledTimes(1)
})

it('publishes a draft without a withdrawal confirmation', async () => {
  await act(() => root.render(<PublishToggle orgSlug="review" published={false} />))
  await act(async () => container.querySelector('button')!.click())
  expect(window.confirm).not.toHaveBeenCalled()
  expect(setOrganizationPublishedAction).toHaveBeenCalledWith('review', true, { error: null }, expect.any(FormData))
})

it('Veröffentlichte Vereinsseite: Camp-Prüfung, Elternlink und Kopierbestätigung', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await act(() => root.render(<PublishToggle orgSlug="testverein" published />))
  expect(container.textContent).toContain('Auf der Elternseite erscheinen nur veröffentlichte Camps.')
  expect(container.querySelector('a[href="/pilot/testverein/dashboard"]')?.textContent).toBe('Weiter zur Camp-Übersicht')
  expect(container.querySelector('a[href="/pilot/testverein"]')?.textContent).toBe('Elternseite ansehen')
  const copy = [...container.querySelectorAll('button')].find(b => b.textContent === 'Anmeldelink kopieren')!
  await act(async () => copy.click())
  expect(writeText).toHaveBeenCalledWith(new URL('/pilot/testverein', window.location.origin).href)
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Anmeldelink kopiert.')
  writeText.mockRejectedValueOnce(new Error('denied'))
  await act(async () => copy.click())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Bitte öffnen Sie die Elternseite')
  expect(container.querySelector('[role="status"]')).toBeNull()
})

it('Entwurf: erklärt den nächsten Schritt ohne technische 404-Meldung und ohne teilbaren Elternlink', async () => {
  await act(() => root.render(<PublishToggle orgSlug="testverein" published={false} />))
  expect(container.textContent).toContain('Veröffentlichen Sie die Seite nach der Freigabe.')
  expect(container.textContent).not.toContain('nicht gefunden')
  expect(container.querySelector('a[href="/pilot/testverein"]')).toBeNull()
})
