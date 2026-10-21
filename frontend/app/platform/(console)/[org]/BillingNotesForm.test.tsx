// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BillingNotesForm from './BillingNotesForm'
import { updateBillingNotesAction, type BillingActionState } from './billingActions'

vi.mock('./billingActions', () => ({ updateBillingNotesAction: vi.fn() }))
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(updateBillingNotesAction).mockResolvedValue({ error: null, saved: true })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.resetAllMocks()
})
async function render() {
  await act(() => root.render(<BillingNotesForm orgSlug="demo" billingNotes="Stored terms" />))
}
async function save() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
it('shows existing conditions and submits edited conditions in the platform console', async () => {
  await render()
  const input = container.querySelector<HTMLTextAreaElement>('[name="billing_notes"]')!
  expect(input.value).toBe('Stored terms')
  expect(container.querySelector('label[for="billing_notes"]')?.textContent).toBe('Konditionen')
  input.value = 'Updated terms'
  await save()
  expect(updateBillingNotesAction).toHaveBeenCalledOnce()
  const [slug, , data] = vi.mocked(updateBillingNotesAction).mock.calls[0]
  expect(slug).toBe('demo')
  expect(data.get('billing_notes')).toBe('Updated terms')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Gespeichert.')
})
it('preserves edited conditions and reports a failed save', async () => {
  vi.mocked(updateBillingNotesAction).mockResolvedValue({ error: 'Save failed', saved: false })
  await render()
  container.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Keep these edits'
  await save()
  expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Keep these edits')
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Save failed')
  expect(container.querySelector('[role="status"]')).toBeNull()
})
it('disables submission and clears stale feedback while saving', async () => {
  await render()
  await save()
  let release: (state: BillingActionState) => void = () => {}
  vi.mocked(updateBillingNotesAction).mockImplementation(() => new Promise(resolve => { release = resolve }))
  await save()
  expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Wird gespeichert …')
  await act(async () => release({ error: null, saved: true }))
  expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false)
})