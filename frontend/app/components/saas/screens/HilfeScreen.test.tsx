// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import HilfeScreen from './HilfeScreen'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/hilfe' }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

const org: OrganizationAdmin = {
  id: 'test-org', slug: 'demo', name: 'Test FC', legal_name: null, legal_address: null,
  contact_email: 'test@example.com', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: '#cc0000', plan_status: 'active', theme: 'tradition',
  iban: null, intro_heading: 'Test', intro_text: 'Test.', hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
  billing_notes: null, site_published: true, camp_count: 0,
  review_status: 'approved', review_note: null,
}

function helpDocument() {
  const doc = window.document.implementation.createHTMLDocument()
  doc.body.innerHTML = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  return doc
}

it('zeigt alle acht Hilfeabschnitte', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toContain('Einrichtung in 4 Schritten')
  expect(html).toContain('Viele Camps an mehreren Orten')
  expect(html).toContain('Camp anlegen und veröffentlichen')
  expect(html).toContain('Anmeldelink teilen')
  expect(html).toContain('Zahlungen prüfen und als bezahlt markieren')
  expect(html).toContain('Warteliste und Storno')
  expect(html).toContain('Tagesliste exportieren')
  expect(html).toContain('Häufige Eltern-Fragen')
})

it('beschreibt die vier Einrichtungsschritte und die Prüfung nach dem Einreichen', () => {
  const section = helpDocument().getElementById('einrichtung')!
  expect([...section.querySelectorAll('li strong')].map(item => item.textContent)).toEqual([
    'Auftritt', 'Rechtliches', 'Erstes Camp', 'Prüfen und einreichen',
  ])
  expect(section.textContent).toContain('innerhalb eines Werktags')
  expect(section.textContent).toContain('Auftragsverarbeitungsvertrag')
  expect(section.textContent).toContain('erneut einreichen')
})

it('erklärt die Filterschwelle und teilbare Links nach Ort und Ferienzeitraum', () => {
  const text = helpDocument().getElementById('camp-filter')!.textContent
  expect(text).toContain('Ab 7 Camps')
  expect(text).toContain('Bei bis zu 6 Camps')
  expect(text).toContain('Ort und Ferienzeitraum')
  expect(text).toContain('vollständige Adresse')
  expect(text).toContain('?ort=Kassel&zeit=sommer')
})

it('verlinkt jeden Abschnitt genau einmal aus dem Inhaltsverzeichnis am Anfang', () => {
  const doc = helpDocument()
  const main = doc.querySelector('main')!
  const nav = main.querySelector('nav')!
  expect(main.firstElementChild).toBe(nav)
  expect(nav.getAttribute('aria-label')).toBe('Auf dieser Seite')
  const sections = [...main.querySelectorAll('section')]
  const links = [...nav.querySelectorAll('a')]
  expect(sections).toHaveLength(8)
  expect(links).toHaveLength(8)
  expect(new Set(sections.map(section => section.id)).size).toBe(8)
  for (const section of sections) {
    expect(section.id).not.toBe('')
    const heading = section.querySelector('h2')!
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id)
    const matches = links.filter(link => link.getAttribute('href') === `#${section.id}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].textContent).toBe(heading.textContent)
    expect(doc.getElementById(section.id)).toBe(section)
  }
})

it('verwendet im gesamten Hilfetext einschließlich Vorlagen keine informelle Anrede', () => {
  const doc = helpDocument()
  const main = doc.querySelector('main')!
  const walker = doc.createTreeWalker(main, window.NodeFilter.SHOW_TEXT)
  const texts: string[] = []
  while (walker.nextNode()) texts.push(walker.currentNode.textContent ?? '')
  texts.push(...[...main.querySelectorAll('textarea')].map(field => field.value))
  const text = texts.join(' ')
  expect(text.match(/\b(?:du|dein(?:e|en|em|er|es)?)\b/giu)).toBeNull()
})

it('zeigt den Hilfelink in der Kopfleiste', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  const doc = window.document.implementation.createHTMLDocument()
  doc.body.innerHTML = html
  const header = doc.querySelector('header')!
  const hilfeLink = [...header.querySelectorAll('a')].find(a => a.textContent?.trim() === 'Hilfe')
  expect(hilfeLink).not.toBeUndefined()
  expect(hilfeLink?.getAttribute('href')).toBe('/pilot/demo/hilfe')
})

it('spricht Eltern in den Vorlagen mit Sie an', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toMatch(/\bSie\b/)
})

it('spricht Eltern in den Antworten mit Sie an', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toContain('Wie läuft die Bezahlung ab?')
  expect(html).toContain('Sie eine Anmeldebestätigung')
})

it('verwendet den Vereinspfad in den Vorlagen', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="testverein" org={{ ...org, slug: 'testverein' }} />)
  expect(html).toContain('/pilot/testverein')
})
