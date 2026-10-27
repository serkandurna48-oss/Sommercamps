// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import RegistrationQuestionsBuilder from './RegistrationQuestionsBuilder'
import { registrationQuestionTemplate } from './registrationQuestionTemplates'

let container: HTMLDivElement
let root: Root
const stored = [{ key: 'position', label: 'Position', type: 'choice', options: ['A', 'B'], other_label: 'Weitere Antwort', required: true }]
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove() })
async function render(value: unknown = [], disabled = false, orgSlug?: string) {
  await act(() => root.render(<form><RegistrationQuestionsBuilder value={value} theme="tradition" orgSlug={orgSlug} disabled={disabled} /></form>))
}
function payload() { return JSON.parse(String(new FormData(container.querySelector('form')!).get('registration_questions'))) }
function button(name: string) {
  return Array.from(container.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') ?? button.textContent) === name)!
}
async function click(name: string) { await act(() => button(name).click()) }
async function change(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')!.set!.call(control, value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
function editor(suffix: string) { return container.querySelector<HTMLInputElement>(`[id$="-${suffix}"]`)! }

it('loads existing configuration and previews the actual parent fields without submitting preview answers', async () => {
  await render(stored)
  expect(editor('label').value).toBe('Position')
  expect(editor('options').value).toBe('A\nB')
  expect(editor('other').value).toBe('Weitere Antwort')
  expect(payload()).toEqual(stored)
  const preview = container.querySelector('fieldset[aria-label="Vorschau der Zusatzfelder"]')!
  expect(preview.textContent).toContain('Position *')
  expect(preview.querySelectorAll('input[type="radio"]')).toHaveLength(3)
  expect(preview.hasAttribute('disabled')).toBe(true)
  expect([...new FormData(container.querySelector('form')!).keys()]).toEqual(['registration_questions'])
  expect(container.querySelector('textarea[name="registration_questions"]')).toBeNull()
})

it('offers the KSV template only to the named organization and keeps it editable', async () => {
  await render([], false, 'other-organization')
  expect(container.textContent).not.toContain('Vorlage übernehmen')
  await render([], false, 'ksv-baunatal')
  await click('Vorlage übernehmen')
  expect(payload()).toEqual([
    { key: 'position', label: 'Position', type: 'choice', options: ['Feldspieler', 'Torwart'], other_label: null, required: true },
    { key: 'verein', label: 'Herkunftsverein', type: 'choice', options: ['KSV Baunatal', 'Kein Verein'], other_label: 'Anderer Verein', required: false },
  ])
  expect(container.textContent).toContain('Kein Verein')
  expect(container.textContent).toContain('Anderer Verein')
  await change(editor('label'), 'Spielposition')
  expect(payload()[0].label).toBe('Spielposition')
})

it.each(['constructor', 'toString', '__proto__'])(
  'does not offer or apply an inherited template for %s', async orgSlug => {
    expect(registrationQuestionTemplate(orgSlug)).toBeNull()
    await render([], false, orgSlug)
    expect(container.textContent).not.toContain('Vorlage übernehmen')
    expect(payload()).toEqual([])
  },
)

it('returns an independent KSV template copy for each application', () => {
  const first = registrationQuestionTemplate('ksv-baunatal')!
  first[0].label = 'Geändert'
  first[0].options!.push('Weitere Position')
  const second = registrationQuestionTemplate('ksv-baunatal')!
  expect(second[0].label).toBe('Position')
  expect(second[0].options).toEqual(['Feldspieler', 'Torwart'])
})

it('adds and edits text/choice fields, required state, options and free-text alternative', async () => {
  await render()
  await click('Feld hinzufügen')
  expect(container.querySelector('form')!.checkValidity()).toBe(false)
  await change(editor('label'), '  ')
  expect(container.querySelector('form')!.checkValidity()).toBe(false)
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Beschriftung')
  await change(editor('label'), 'Zusatzangabe')
  const key = payload()[0].key
  await change(editor('type'), 'choice')
  await change(editor('options'), 'Erste\nZweite')
  await change(editor('other'), 'Eigene Antwort')
  await act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(payload()[0]).toEqual({ key, label: 'Zusatzangabe', type: 'choice', options: ['Erste', 'Zweite'], other_label: 'Eigene Antwort', required: true })
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('form')!.checkValidity()).toBe(true)
  await change(editor('type'), 'text')
  await change(editor('type'), 'choice')
  expect(editor('options').value).toBe('Erste\nZweite')
  expect(payload()[0].key).toBe(key)
})

it('reorders in both directions and removes fields while retaining their keys', async () => {
  const second = { key: 'hinweis', label: 'Hinweis', type: 'text', required: false, options: null, other_label: null }
  await render([...stored, second])
  expect(button('Feld 1 nach oben').disabled).toBe(true)
  expect(button('Feld 2 nach unten').disabled).toBe(true)
  await click('Feld 2 nach oben')
  expect(payload()).toEqual([second, ...stored])
  await click('Feld 1 nach unten')
  expect(payload()).toEqual([...stored, second])
  await click('Feld 1 entfernen')
  expect(payload()).toEqual([second])
  await click('Feld 1 entfernen')
  expect(payload()).toEqual([])
  expect(container.textContent).toContain('keine Zusatzfelder')
})

it('limits adding to five fields', async () => {
  await render()
  for (let i = 0; i < 5; i++) await click('Feld hinzufügen')
  expect(button('Feld hinzufügen').disabled).toBe(true)
  await click('Feld hinzufügen')
  expect(payload()).toHaveLength(5)
  await click('Feld 3 entfernen')
  expect(button('Feld hinzufügen').disabled).toBe(false)
})

it.each(['{', {}, [null], [{ ...stored[0], options: {} }], [{ ...stored[0], type: 'old' }]])(
  'keeps malformed stored data untouched until explicitly reset: %j', async value => {
    await render(value)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('bleiben sie unverändert')
    expect(new FormData(container.querySelector('form')!).has('registration_questions')).toBe(false)
    await click('Zusatzfelder verwerfen und neu einrichten')
    expect(payload()).toEqual([])
    await click('Feld hinzufügen')
    expect(payload()).toHaveLength(1)
  },
)

it('resyncs fresh persisted props and disables editing while saving', async () => {
  await render(stored)
  await change(editor('label'), 'Entwurf')
  await render([{ ...stored[0], label: 'Gespeichert' }])
  expect(editor('label').value).toBe('Gespeichert')
  await render(stored, true)
  expect(editor('label').matches(':disabled')).toBe(true)
})
