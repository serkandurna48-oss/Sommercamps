// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SubmitReviewButton from './SubmitReviewButton'

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

type SubmitAction = (orgSlug: string, avvVersion: string) => Promise<{ ok: boolean; error?: string }>

async function renderBtn(submitAction: SubmitAction, reviewNote: string | null = null) {
  await act(() => root.render(
    <SubmitReviewButton
      orgSlug="demo"
      brandStrong="#116644"
      brandOn="#fff"
      reviewNote={reviewNote}
      submitAction={submitAction}
    />
  ))
}

async function clickText(text: string) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  expect(btn, `Button "${text}" nicht gefunden`).toBeDefined()
  await act(() => btn!.click())
}

function getAvvCheckbox(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
}

describe('SubmitReviewButton', () => {
  it('zeigt den „Zur Freigabe einreichen"-Knopf im Ausgangszustand', async () => {
    await renderBtn(vi.fn())
    expect(container.textContent).toContain('Zur Freigabe einreichen')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Klick öffnet Dialog mit AVV-Hinweis und Checkbox', async () => {
    await renderBtn(vi.fn())
    await clickText('Zur Freigabe einreichen')
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Auftragsverarbeitungsvertrag')
    expect(getAvvCheckbox()).not.toBeNull()
  })

  it('Einreichen ohne AVV-Haken: kein API-Aufruf (Mutationsprobe)', async () => {
    const action = vi.fn<SubmitAction>().mockResolvedValue({ ok: true })
    await renderBtn(action)
    await clickText('Zur Freigabe einreichen')
    // AVV checkbox is NOT checked — click "Jetzt einreichen" anyway
    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Jetzt einreichen')!
    await act(() => submitBtn.click())
    expect(action).not.toHaveBeenCalled()
  })

  it('Einreichen mit AVV-Haken: API-Aufruf mit korrekter avv_version', async () => {
    const action = vi.fn<SubmitAction>().mockResolvedValue({ ok: true })
    await renderBtn(action)
    await clickText('Zur Freigabe einreichen')
    await act(() => getAvvCheckbox().click())
    await clickText('Jetzt einreichen')
    expect(action).toHaveBeenCalledOnce()
    expect(action).toHaveBeenCalledWith('demo', '2026-10')
  })

  it('Erfolg: Banner „Wir prüfen Ihren Verein" erscheint', async () => {
    const action = vi.fn<SubmitAction>().mockResolvedValue({ ok: true })
    await renderBtn(action)
    await clickText('Zur Freigabe einreichen')
    await act(() => getAvvCheckbox().click())
    await clickText('Jetzt einreichen')
    await act(async () => {})
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain('prüfen')
    expect(status?.textContent).toContain('meist innerhalb eines Werktags')
    expect(container.querySelector('a[href="/pilot/demo/einrichtung?schritt=4"]')?.textContent?.trim()).toBe('Freigabestatus aktualisieren')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Ablehnungsgrund wird bei rejected angezeigt', async () => {
    await renderBtn(vi.fn(), 'Logo fehlt.')
    expect(container.textContent).toContain('Logo fehlt.')
  })

  it('Verbindungsfehler beim Einreichen lässt den Verein erneut versuchen', async () => {
    await renderBtn(vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    await clickText('Zur Freigabe einreichen')
    await act(() => getAvvCheckbox().click())
    await clickText('Jetzt einreichen')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Die Angaben konnten nicht eingereicht werden. Bitte versuchen Sie es erneut.')
    await clickText('Zur Freigabe einreichen')
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('Abbrechen schließt Dialog ohne API-Aufruf', async () => {
    const action = vi.fn<SubmitAction>()
    await renderBtn(action)
    await clickText('Zur Freigabe einreichen')
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    await clickText('Abbrechen')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(action).not.toHaveBeenCalled()
  })
})
