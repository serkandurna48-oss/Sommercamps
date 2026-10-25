// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrierenForm from './RegistrierenForm'

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
  vi.useRealTimers()
})

async function renderForm() {
  await act(() => root.render(<RegistrierenForm />))
}

function getInput(id: string): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(`#${id}`)
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function fillValidForm() {
  await act(() => {
    setNativeValue(getInput('rf-organization_name')!, 'Testverein FC')
    setNativeValue(getInput('rf-contact_person_name')!, 'Max Mustermann')
    setNativeValue(getInput('rf-email')!, 'max@testverein.de')
    setNativeValue(getInput('rf-password')!, 'sicheres123')
  })
  await act(() => {
    getInput('rf-terms')!.click()
  })
}

async function submitForm() {
  await act(() => {
    const form = container.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('RegistrierenForm — Validierung', () => {
  it('leeres Pflichtfeld: kein API-Aufruf', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 201 })
    )
    await renderForm()
    await submitForm()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte geben Sie den Vereinsnamen ein.')
  })

  it('kurzes Passwort: kein API-Aufruf', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 201 })
    )
    await renderForm()
    await act(() => {
      setNativeValue(getInput('rf-organization_name')!, 'Testverein')
      setNativeValue(getInput('rf-contact_person_name')!, 'Max')
      setNativeValue(getInput('rf-email')!, 'max@test.de')
      setNativeValue(getInput('rf-password')!, 'kurz')
    })
    await act(() => { getInput('rf-terms')!.click() })
    await submitForm()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('mindestens 10 Zeichen')
  })

  it('Haken fehlt: kein API-Aufruf', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 201 })
    )
    await renderForm()
    await act(() => {
      setNativeValue(getInput('rf-organization_name')!, 'Testverein')
      setNativeValue(getInput('rf-contact_person_name')!, 'Max')
      setNativeValue(getInput('rf-email')!, 'max@test.de')
      setNativeValue(getInput('rf-password')!, 'sicheres123')
    })
    // Terms checkbox intentionally NOT checked
    await submitForm()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Nutzungsbedingungen')
  })
})

describe('RegistrierenForm — Serverfehler', () => {
  it('409 zeigt deutsche Fehlermeldung, E-Mail-Eingabe bleibt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 409 }))
    await renderForm()
    await fillValidForm()
    await submitForm()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/bereits vorhanden|melden Sie sich an/)
    expect(getInput('rf-email')?.value).toBe('max@testverein.de')
    expect(alert?.querySelector('a')?.getAttribute('href')).toBe('/campspilot/anmelden')
  })

  it('429 zeigt Rate-Limit-Meldung', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }))
    await renderForm()
    await fillValidForm()
    await submitForm()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/warten Sie eine Stunde/)
  })
})

describe('RegistrierenForm — Erfolg und Bestätigungsseite', () => {
  it('erklärt die Freigabe und bietet bestehenden Vereinen eine Anmeldung ohne bekannte Vereinsadresse', async () => {
    await renderForm()
    expect(container.textContent).toContain('meist innerhalb eines Werktags')
    expect(container.textContent).not.toContain('Sie starten heute noch')
    expect(container.querySelector('a[href="/campspilot/anmelden"]')?.textContent).toBe('Zur Anmeldung')
  })

  it('Erfolg zeigt Bestätigungsseite mit E-Mail und Login-Link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ organization_slug: 'testverein-fc', confirmation_email_sent: true }),
        { status: 201 }
      )
    )
    await renderForm()
    await fillValidForm()
    await submitForm()
    expect(container.textContent).toContain('E-Mail-Adresse')
    expect(container.textContent).toContain('max@testverein.de')
    expect(container.textContent).toContain('24 Stunden')
    const loginLink = container.querySelector<HTMLAnchorElement>('a[href="/pilot/testverein-fc/login"]')
    expect(loginLink).not.toBeNull()
    expect(loginLink?.textContent?.trim()).toBe('Zur Anmeldung')
    expect(container.textContent).toContain('Kehren Sie danach hierher zurück')
    expect(container.textContent).toContain('Spam-Ordner')
  })

  it('confirmation_email_sent=false: ehrlicher Hinweis und prominenter resend-Knopf', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ organization_slug: 'testverein', confirmation_email_sent: false }),
        { status: 201 }
      )
    )
    await renderForm()
    await fillValidForm()
    await submitForm()
    expect(container.textContent).toMatch(/nicht zugestellt/)
    const resendBtn = [...container.querySelectorAll('button')].find(
      b => b.textContent?.includes('E-Mail erneut senden')
    )
    expect(resendBtn).not.toBeNull()
    expect(resendBtn!.hasAttribute('disabled')).toBe(false)
  })
})

describe('RegistrierenForm — Resend Cooldown', () => {
  it.each([202, 429, 503, 0])('erneuter Versand %s: zeigt eine ehrliche Rückmeldung und behält den Login-Link', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ organization_slug: 'testverein', confirmation_email_sent: false }), { status: 201 }))
    if (status) fetchMock.mockResolvedValueOnce(new Response('{}', { status }))
    else fetchMock.mockRejectedValueOnce(new Error('offline'))
    await renderForm()
    await fillValidForm()
    await submitForm()
    const resend = [...container.querySelectorAll('button')].find(b => b.textContent === 'E-Mail erneut senden')!
    await act(async () => resend.click())
    expect(container.textContent).toContain(status === 202 ? 'Erneuter Versand angefragt.' : status === 429 ? 'Bitte warten Sie eine Stunde' : status === 0 ? 'Bitte prüfen Sie Ihre Internetverbindung' : 'Der erneute Versand konnte nicht angefragt werden.')
    expect(container.querySelector('a[href="/pilot/testverein/login"]')?.textContent?.trim()).toBe('Zur Anmeldung')
  })

  it('resend sperrt den Knopf für 60 Sekunden', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ organization_slug: 'demo', confirmation_email_sent: true }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response('{}', { status: 202 }))

    await renderForm()
    await fillValidForm()
    await submitForm()

    const resendBtn = () =>
      [...container.querySelectorAll('button')].find(
        b => b.textContent?.includes('E-Mail erneut senden') || b.textContent?.match(/Erneut senden/)
      )!

    expect(resendBtn().hasAttribute('disabled')).toBe(false)

    await act(() => resendBtn().click())
    expect(resendBtn().hasAttribute('disabled')).toBe(true)
    expect(resendBtn().textContent).toMatch(/\d+ s/)

    await act(async () => vi.advanceTimersByTime(60_000))
    expect(resendBtn().hasAttribute('disabled')).toBe(false)
  })
})
