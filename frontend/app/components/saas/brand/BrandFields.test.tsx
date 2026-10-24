// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import BrandPreview from './BrandPreview'
import ColorField from './ColorField'

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
})

async function change(input: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function ColorExample() {
  const [color, setColor] = useState('#123456')
  return <><ColorField id="test-color" value={color} onChange={setColor} /><BrandPreview name="Testverein" logoUrl={null} color={color} theme="tradition" /></>
}

it('renders the name, logo and chosen button color with the public text contrast', async () => {
  await act(() => root.render(<BrandPreview name="Testverein" logoUrl="/clubs/demo/logo.png" color="#B8912B" theme="tradition" />))
  expect(container.textContent).toContain('Testverein')
  expect(container.querySelector('img')!.getAttribute('src')).toBe('/clubs/demo/logo.png')
  const button = container.querySelector<HTMLElement>('.btn.primary')!
  expect(button.style.background).toBe('rgb(184, 145, 43)')
  expect(button.style.color).toBe('rgb(17, 17, 17)')
})

it('switches the preview theme class and uses the public primary button styles', async () => {
  for (const theme of ['tradition', 'akademie', 'kompakt'] as const) {
    await act(() => root.render(<BrandPreview name="Testverein" logoUrl={null} color="#cc0000" theme={theme} />))
    expect(container.querySelector(`.cp-public.brand-preview-${theme}`)?.getAttribute('data-theme')).toBe(theme)
    expect(container.querySelector('.btn.primary')).not.toBeNull()
  }
})

it('keeps the assistant presentation without a theme and never loads an unsafe logo', async () => {
  await act(() => root.render(<BrandPreview name="" logoUrl="javascript:alert(1)" color="#123456" />))
  expect(container.textContent).toContain('Vereinsname')
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('.cp-public')).toBeNull()
  expect(container.querySelector<HTMLElement>('.cp-label')!.style.color).toBe('rgb(255, 255, 255)')
})

it('syncs picker to hex and to the live preview (mutation probe)', async () => {
  await act(() => root.render(<ColorExample />))
  await change(container.querySelector('input[type="color"]')!, '#b8912b')
  expect(container.querySelector<HTMLInputElement>('#test-color')!.value).toBe('#b8912b')
  expect(container.querySelector<HTMLElement>('.btn.primary')!.style.background).toBe('rgb(184, 145, 43)')
})

it('syncs hex to picker, including short hex codes', async () => {
  await act(() => root.render(<ColorExample />))
  const text = container.querySelector<HTMLInputElement>('#test-color')!
  const picker = container.querySelector<HTMLInputElement>('input[type="color"]')!
  await change(text, '#CC0000')
  expect(picker.value).toBe('#cc0000')
  await change(text, '#abc')
  expect(text.value).toBe('#abc')
  expect(picker.value).toBe('#aabbcc')
  expect(container.querySelector<HTMLElement>('.btn.primary')!.style.color).toBe('rgb(17, 17, 17)')
})

it('links an invalid hex error to the field and clears it after correction or clearing', async () => {
  await act(() => root.render(<ColorExample />))
  const text = container.querySelector<HTMLInputElement>('#test-color')!
  await change(text, '#invalid')
  expect(container.querySelector('#test-color-error')!.textContent).toContain('Ungültiger Hex-Code')
  expect(text.getAttribute('aria-invalid')).toBe('true')
  expect(text.getAttribute('aria-describedby')).toContain('test-color-error')
  await change(container.querySelector('input[type="color"]')!, '#112233')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  await change(text, '')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})
