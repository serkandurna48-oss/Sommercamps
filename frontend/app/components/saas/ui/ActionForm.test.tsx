// @vitest-environment jsdom
/**
 * B6 — Bestätigungspflicht unabhängig von vorherigen Aktionsergebnissen.
 * Der Bestätigungszustand wird nach Erfolg, Fehler und Abbrechen zurückgesetzt.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ActionForm, { type ActionFormState } from './ActionForm'

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
  vi.clearAllMocks()
})

type ActionFn = (s: ActionFormState, fd: FormData) => Promise<ActionFormState>

async function renderForm(action: ActionFn) {
  await act(() =>
    root.render(
      <ActionForm
        action={action}
        label="Aufrücken"
        pendingLabel="Rückt auf…"
        requireConfirm="Wirklich aufrücken?"
      />,
    ),
  )
}

async function clickButton(text: string) {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  )
  expect(btn, `Button "${text}" nicht gefunden`).toBeDefined()
  await act(() => btn!.click())
}

async function submitForm() {
  const form = container.querySelector('form')
  expect(form, 'Formular nicht gefunden').toBeDefined()
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

it('zwei aufeinanderfolgende Beförderungen verlangen je eine eigene Bestätigung', async () => {
  const action = vi.fn<ActionFn>().mockResolvedValue({ error: null, success: 'Befördert!' })
  await renderForm(action)

  // Erste Beförderung: kein Form ohne Bestätigung
  expect(container.querySelector('form')).toBeNull()
  await clickButton('Aufrücken')
  expect(container.querySelector('form')).not.toBeNull()
  await submitForm()
  expect(action).toHaveBeenCalledTimes(1)

  // Nach Erfolg ist Bestätigungszustand zurückgesetzt
  expect(container.querySelector('form')).toBeNull()

  // Zweite Beförderung braucht wieder eigene Bestätigung
  await clickButton('Aufrücken')
  expect(container.querySelector('form')).not.toBeNull()
  await submitForm()
  expect(action).toHaveBeenCalledTimes(2)
})

it('nach Fehler ist kein unbestätigter Submit erreichbar', async () => {
  const action = vi.fn<ActionFn>().mockResolvedValue({ error: 'Server-Fehler', success: null })
  await renderForm(action)

  await clickButton('Aufrücken')
  await submitForm()
  expect(action).toHaveBeenCalledTimes(1)

  // Nach Fehler: Submit-Button nicht direkt erreichbar
  expect(container.querySelector('form')).toBeNull()

  // Erneuter Versuch erfordert Bestätigung
  await clickButton('Aufrücken')
  expect(container.querySelector('form')).not.toBeNull()
  await submitForm()
  expect(action).toHaveBeenCalledTimes(2)
})

it('nach Abbrechen ist kein unbestätigter Submit erreichbar', async () => {
  const action = vi.fn<ActionFn>()
  await renderForm(action)

  await clickButton('Aufrücken')
  expect(container.querySelector('form')).not.toBeNull()
  await clickButton('Abbrechen')

  // Nach Abbrechen: Submit-Button nicht direkt erreichbar, Aktion nicht ausgelöst
  expect(container.querySelector('form')).toBeNull()
  expect(action).not.toHaveBeenCalled()
})
