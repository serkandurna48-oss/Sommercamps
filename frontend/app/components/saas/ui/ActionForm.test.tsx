// @vitest-environment jsdom
/**
 * B6 — Bestätigungspflicht unabhängig von vorherigen Aktionsergebnissen.
 * Der Bestätigungszustand wird nach Erfolg, Fehler und Abbrechen zurückgesetzt.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ActionForm, { type ActionFormState } from './ActionForm'
import { AdminPreviewContext } from '../preview/AdminPreviewContext'

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

  // Gleicher Erfolgstext wie zuvor: Bestätigungszustand trotzdem zurückgesetzt
  expect(container.querySelector('form')).toBeNull()
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

it('Abbrechen ist disabled während pending, danach zurück zum Einstiegsbutton', async () => {
  let resolveAction!: (v: ActionFormState) => void
  const action = vi.fn<ActionFn>().mockReturnValueOnce(
    new Promise<ActionFormState>(r => { resolveAction = r }),
  )
  await renderForm(action)
  await clickButton('Aufrücken')

  const form = container.querySelector('form')!
  // Non-awaited act: dispatches submit → transition starts (pending=true) without waiting for action
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  const cancelBtn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Abbrechen',
  )
  expect(cancelBtn, 'Abbrechen-Button muss sichtbar bleiben').toBeDefined()
  expect(cancelBtn!.disabled).toBe(true)
  expect(cancelBtn!.getAttribute('aria-disabled')).toBe('true')

  // Resolve the action — state resets to entry button
  await act(async () => { resolveAction({ error: null, success: null }) })
  expect(container.querySelector('form')).toBeNull()
  const entryBtn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Aufrücken',
  )
  expect(entryBtn, 'Einstiegsbutton muss nach Abschluss wieder da sein').toBeDefined()
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

it('verknüpft Bestätigung und Aktionsfehler mit dem jeweiligen Button', async () => {
  const action = vi.fn<ActionFn>().mockResolvedValue({ error: 'Server-Fehler', success: null })
  await renderForm(action)
  await clickButton('Aufrücken')
  const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const confirmId = submit.getAttribute('aria-describedby')!
  expect(document.getElementById(confirmId)?.textContent).toBeTruthy()
  await submitForm()
  const entry = container.querySelector('button')!
  const errorId = entry.getAttribute('aria-describedby')!
  expect(document.getElementById(errorId)?.textContent).toBe('Server-Fehler')
  await clickButton('Aufrücken')
  const descriptions = container.querySelector('button[type="submit"]')!.getAttribute('aria-describedby')!.split(' ')
  expect(descriptions).toHaveLength(2)
  for (const id of descriptions) expect(document.getElementById(id)?.textContent).toBeTruthy()
})

it.each([false, true])('preserves result callbacks and linked confirmation in preview: %s', async preview => {
  const result = { error: null, success: 'Anmeldung storniert.', promoted: null }
  const action = vi.fn<ActionFn>().mockResolvedValue(result)
  const onResult = vi.fn()
  await act(() => root.render(
    <AdminPreviewContext.Provider value={preview ? { empty: false } : null}>
      <ActionForm action={action} onResult={onResult} label="Stornieren" pendingLabel="Wird storniert"
        cancelLabel="Behalten" requireConfirm={<><p>Anmeldung stornieren?</p><p>Ein Platz wird frei.</p></>} />
    </AdminPreviewContext.Provider>,
  ))
  await clickButton('Stornieren')
  const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const description = document.getElementById(submit.getAttribute('aria-describedby')!)!
  expect(description.textContent).toContain('Anmeldung stornieren?')
  expect(description.textContent).toContain('Ein Platz wird frei.')
  expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Behalten')).toBe(true)
  await submitForm()
  expect(onResult).toHaveBeenCalledOnce()
  if (preview) {
    expect(action).not.toHaveBeenCalled()
    const entry = container.querySelector('button')!
    expect(document.getElementById(entry.getAttribute('aria-describedby')!)?.textContent).toContain('Vorschau')
    expect(onResult.mock.calls[0][0].error).toContain('Vorschau')
  } else {
    expect(action).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith(result)
    // The persistent RegistrationActionFeedback owns successful results.
    expect(container.querySelector('[role="status"]')).toBeNull()
  }
  expect(container.querySelector('form')).toBeNull()
})
