// @vitest-environment jsdom
/**
 * MK1 PilotRequestForm — Frontend-Tests
 *
 * Geprüft:
 *   prf1  – Pflichtfehler Verein: kein API-Aufruf
 *   prf2  – Pflichtfehler E-Mail: kein API-Aufruf
 *   prf3  – Erfolg ersetzt das Formular
 *   prf4  – 429 zeigt Hinweistext mit „Stunde"
 *   prf5  – 503 zeigt mailto-Link
 *   prf6  – Netzwerkfehler zeigt mailto-Link
 *   prf7  – Entwurfssatz taucht nie auf
 *
 * Mutationsprobe prf3:
 *   Wenn die Honeypot-Prüfung aus PilotRequestForm entfernt wird (website-Feld
 *   fehlt im Body), schlägt test_honeypot_no_mail im Backend-Test rot — das
 *   Frontend sendet bei Honeypot-Füllung aber trotzdem, was der Backend-Test
 *   sicherstellt. Für die Frontend-Seite: wenn der Erfolg-Zweig (`setSendState
 *   ('success')`) entfernt wird, schlägt prf3 rot, weil das Formular sichtbar bleibt.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PilotRequestForm from './PilotRequestForm'

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
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

async function renderForm() {
  await act(() => root.render(<PilotRequestForm />))
}

describe('Paketauswahl aus der Preisübersicht', () => {
  it.each(['Start', 'Verein', 'Fußballschule'])('füllt %s aus der URL vor und lässt die Nachricht bearbeiten', async (name) => {
    window.history.replaceState({}, '', `/campspilot?paket=${encodeURIComponent(name)}#pilot`)
    await renderForm()
    const field = container.querySelector<HTMLTextAreaElement>('#prf-nachricht')!
    expect(field.value).toBe(`Ich interessiere mich für das Paket „${name}“. Bitte senden Sie mir weitere Informationen.`)
    field.value = 'Meine eigene Frage'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    await fillAndSubmit('Testverein FC', 'info@example.test')
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).nachricht).toBe('Meine eigene Frage')
  })

  it.each(['', '?paket=Unbekannt', '?paket=%3Cscript%3E'])('lässt die Nachricht ohne gültiges Paket leer (%s)', async (query) => {
    window.history.replaceState({}, '', `/campspilot${query}`)
    await renderForm()
    expect(container.querySelector<HTMLTextAreaElement>('#prf-nachricht')?.value).toBe('')
  })
})

function getInput(id: string): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(`#${id}`)
}

function setNativeValue(el: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function fillAndSubmit(verein: string, email: string) {
  await act(() => {
    const vereinEl = getInput('prf-verein')
    const emailEl = getInput('prf-email')
    if (vereinEl) setNativeValue(vereinEl, verein)
    if (emailEl) setNativeValue(emailEl, email)
  })
  await act(() => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

// ---------------------------------------------------------------------------
// prf1 + prf2 — Pflichtfehler
// ---------------------------------------------------------------------------

describe('PilotRequestForm — Pflichtfehler', () => {
  it('prf1 – leerer Verein: kein API-Aufruf, Fehlermeldung sichtbar', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    await renderForm()
    await fillAndSubmit('', 'info@testverein.de')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte geben Sie den Vereinsnamen ein.')
  })

  it('prf2 – leere E-Mail: kein API-Aufruf, Fehlermeldung sichtbar', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    await renderForm()
    await fillAndSubmit('Testverein FC', '')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte geben Sie eine E-Mail-Adresse ein.')
  })
})

// ---------------------------------------------------------------------------
// prf3–prf6 — Sendezustände
// ---------------------------------------------------------------------------

describe('PilotRequestForm — Sendezustände', () => {
  it('prf3 – Erfolg (200) ersetzt das Formular', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.querySelector('form')).toBeNull()
    expect(container.textContent).toContain(
      'Danke. Wir melden uns innerhalb eines Werktags bei Ihnen.',
    )
  })

  it('prf3b – Erfolg (204 Honeypot-Fallthrough) ersetzt das Formular', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.querySelector('form')).toBeNull()
  })

  it('prf4 – 429 zeigt Hinweistext mit Stunde, Formular bleibt sichtbar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.textContent).toContain('Zu viele Anfragen')
    expect(container.textContent).toContain('Stunde')
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('prf5 – 503 zeigt mailto-Link, Formular bleibt sichtbar', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'kontakt@example.org')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull()
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('prf6 – Netzwerkfehler zeigt mailto-Link', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'kontakt@example.org')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull()
  })

  it('prf8 – ohne Kontaktadresse kein mailto, aber Hinweis', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', '')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull()
    expect(container.textContent).toContain('später erneut')
  })
})

// ---------------------------------------------------------------------------
// prf7 — Entwurfssatz
// ---------------------------------------------------------------------------

describe('PilotRequestForm — Entwurfssatz', () => {
  it('prf7 – „Dies ist ein Seitenentwurf" taucht im Idle-Zustand nicht auf', async () => {
    await renderForm()
    expect(container.textContent).not.toContain('Dies ist ein Seitenentwurf')
  })

  it('prf7b – „Dies ist ein Seitenentwurf" taucht im Erfolgszustand nicht auf', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    await renderForm()
    await fillAndSubmit('Testverein FC', 'info@testverein.de')
    expect(container.textContent).not.toContain('Dies ist ein Seitenentwurf')
  })
})
