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
