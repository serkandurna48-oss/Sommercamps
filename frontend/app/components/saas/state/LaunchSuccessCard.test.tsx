// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LaunchSuccessCard from './LaunchSuccessCard'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render() {
  await act(() => root.render(
    <LaunchSuccessCard orgSlug="demo" brandStrong="#116644" brandOn="#fff" />
  ))
}

it('shows success label, copy-link button and parent-site link', async () => {
  await render()
  expect(container.textContent).toContain('Ihre Anmeldeseite ist live.')
  expect(container.textContent).toContain('Anmeldelink kopieren')
  expect(container.textContent).toContain('Elternseite ansehen')
  const parentLink = container.querySelector<HTMLAnchorElement>('a[href="/pilot/demo"]')
  expect(parentLink).not.toBeNull()
})

it('copies the registration URL and shows confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await render()
  const copyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Anmeldelink kopieren')!
  await act(async () => copyBtn.click())
  expect(writeText).toHaveBeenCalledWith(new URL('/pilot/demo', window.location.origin).href)
  // SuccessNote also carries role="status"; check all of them
  const statusEls = [...container.querySelectorAll('[role="status"]')]
  expect(statusEls.some(el => el.textContent?.includes('Anmeldelink kopiert.'))).toBe(true)
})

it('shows an error message when clipboard access is denied', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await render()
  const copyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Anmeldelink kopieren')!
  await act(async () => copyBtn.click())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Kopieren nicht möglich')
  expect(container.textContent).not.toContain('Anmeldelink kopiert.')
})
