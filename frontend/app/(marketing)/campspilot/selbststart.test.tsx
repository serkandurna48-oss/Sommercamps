// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CampsPilotPage from './page'
import PreisePage from '../preise/page'
import { faq } from '../preise/pakete'

vi.mock('../../components/marketing/SiteMotion', () => ({ default: () => null }))
vi.mock('../../components/marketing/BootCurtain', () => ({ default: () => null }))

describe.each([
  ['/campspilot', CampsPilotPage],
  ['/preise', PreisePage],
] as const)('CX34 Selbststart auf %s', (_route, Page) => {
  let page: HTMLDivElement

  beforeEach(() => {
    page = document.createElement('div')
    page.innerHTML = renderToStaticMarkup(createElement(Page))
  })

  it('verlinkt den primären Hero-Button zur bestehenden Vereinsregistrierung', () => {
    const primary = page.querySelector('header .hero-cta a:first-child')!
    expect(primary.textContent).toBe('Verein registrieren')
    expect(primary.classList.contains('fill')).toBe(true)
    expect(primary.getAttribute('href')).toBe('/campspilot/registrieren')
    const secondary = primary.nextElementSibling!
    expect(secondary.textContent).toBe('Unverbindlich anfragen')
    expect(secondary.classList.contains('ghost')).toBe(true)
    expect(secondary.getAttribute('href')).toMatch(/^(\/campspilot)?#pilot$/)
  })

  it('führt auch über Navigation und alle Paketkarten primär zur Registrierung', () => {
    const nav = page.querySelector('nav .btn')!
    expect(nav.textContent).toBe('Verein registrieren')
    expect(nav.getAttribute('href')).toBe('/campspilot/registrieren')
    const cards = page.querySelectorAll('#preis article')
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      const primary = card.querySelector('a')!
      expect(primary.textContent).toBe('Verein registrieren')
      expect(primary.classList.contains('price-cta')).toBe(true)
      expect(primary.getAttribute('href')).toBe('/campspilot/registrieren')
      const secondary = card.querySelector('.price-inquiry')!
      expect(secondary.textContent).toContain('Unverbindlich anfragen')
      const target = new URL(secondary.getAttribute('href')!, 'https://verein.example.test')
      expect(target.pathname).toBe('/campspilot')
      expect(target.hash).toBe('#pilot')
      expect(target.searchParams.get('paket')).toBe(card.querySelector('h3')!.textContent)
    }
  })

  it('rendert genau drei Startschritte in Produktreihenfolge', () => {
    const section = page.querySelector('section#start')!
    expect(section.querySelector('h2')!.textContent).toBe('So starten Sie')
    const steps = Array.from(section.querySelectorAll('ol > li'))
    expect(steps).toHaveLength(3)
    expect(steps.map(step => step.querySelector('h3')!.textContent)).toEqual([
      'Verein registrieren',
      'Wir prüfen und schalten frei',
      'Camp anlegen und Anmeldelink teilen',
    ])
    expect(steps[0].textContent).toMatch(/Konto.*bestätigen.*E-Mail/)
    expect(steps[1].textContent).toContain('zur Freigabe ein')
    expect(steps[1].textContent).toContain('manuell')
    expect(steps[1].textContent).toContain('nach erfolgreicher Prüfung')
    expect(steps[2].textContent).toContain('veröffentlichen')
    expect(steps[2].textContent).toContain('Anmeldelink mit den Eltern')
    expect(section.textContent).not.toMatch(/Minuten|Stunden|Werktag|heute|wenige|Countdown/i)
  })

  it('erklärt die Registrierung auch in der gerenderten Start-FAQ', () => {
    const entry = Array.from(page.querySelectorAll('#fragen details')).find(
      item => item.querySelector('summary')!.textContent === 'Wie läuft der Start ab?',
    )!
    expect(entry.querySelector('p')!.textContent).toMatch(/registrieren.*E-Mail bestätigen.*manuell.*Camp anlegen.*Anmeldelink/)
  })
})

it('nennt in pakete.ts die Registrierung und alle drei Startschritte', () => {
  const answer = faq.find(entry => entry.frage === 'Wie läuft der Start ab?')!.antwort
  expect(answer).toContain('registrieren')
  expect(answer).toMatch(/1\).*Konto.*E-Mail bestätigen.*2\).*manuell.*frei.*3\).*Camp anlegen.*Anmeldelink/)
})
