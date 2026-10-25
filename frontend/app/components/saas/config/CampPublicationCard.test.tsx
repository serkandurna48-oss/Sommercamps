// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import CampPublicationCard from './CampPublicationCard'

const camp: CampAdmin = {
  id: 'camp', organization_id: 'org', slug: 'summer', title: 'Summer',
  start_date: '2027-07-05', end_date: '2027-07-09', registration_start: null, registration_end: null,
  age_min: 6, age_max: 12, capacity: 20, price_cents: 14900, currency: 'EUR', status: 'draft',
  location: null, care_info: null, meals_info: null, includes: null,
}
const org = { site_published: false, contact_email: '', iban: null, terms_text: null }
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
  vi.unstubAllGlobals()
})

it.each([false, true].flatMap(sitePublished => (['draft', 'published', 'closed', 'archived'] as const).map(status => ({ sitePublished, status }))))(
  'shows accurate publication states for $sitePublished / $status', async ({ sitePublished, status }) => {
    await act(() => root.render(<CampPublicationCard orgSlug="review" org={{ ...org, site_published: sitePublished }} camp={{ ...camp, status }} pending={false} brandStrong="#112233" brandOn="#ffffff" />))
    const labels = { draft: 'Entwurf', published: 'Öffentlich', closed: 'Geschlossen', archived: 'Archiviert' }
    expect(container.textContent).toContain(`Vereinsseite: ${sitePublished ? 'Öffentlich' : 'Entwurf'}`)
    expect(container.textContent).toContain(`Camp: ${labels[status]}`)
    expect(container.textContent).toContain('Anmeldezeitraum')
    expect(container.textContent).toContain('Prüfen Sie Ihre gespeicherten Angaben')
    expect(container.textContent).not.toMatch(/\b(du|deine)\b/)
    expect(container.textContent).toContain('Ab sofort – Kein Enddatum festgelegt')
    expect(container.textContent!.includes('Camp ist für Eltern erreichbar')).toBe(sitePublished && status === 'published')
    expect(container.textContent!.includes('Anmeldelink kopieren')).toBe(sitePublished && status === 'published')
    expect(container.textContent!.includes('Eltern sehen das Camp erst, wenn auch die Vereinsseite veröffentlicht ist')).toBe(!sitePublished)
    expect(container.querySelector('[value="published"]') !== null).toBe(status !== 'published')
    const checks = Array.from(container.querySelectorAll('li'))
    expect(checks.map(check => check.textContent)).toEqual(['!Kontakt-E-Mail– Fehltergänzen', '!Bankverbindung– Fehltergänzen', '!Ort– Fehltergänzen', '!Teilnahmebedingungen– Fehltergänzen'])
    expect(checks.map(check => check.querySelector('a')!.getAttribute('href'))).toEqual(['/pilot/review/konfiguration#contact_email', '/pilot/review/konfiguration#iban', '#location', '/pilot/review/konfiguration#terms_text'])
    if (!sitePublished) expect(container.querySelector('a[href="/pilot/review/konfiguration#publication"]')).not.toBeNull()
  },
)

it('shows completed checks and explicit registration dates', async () => {
  await act(() => root.render(<CampPublicationCard orgSlug="review" org={{ site_published: true, contact_email: 'test@example.com', iban: 'DE123', terms_text: 'Bedingungen' }} camp={{ ...camp, location: 'Sportplatz', registration_start: '2027-06-01T08:00:00Z', registration_end: '2027-07-01T16:00:00Z' }} pending={false} brandStrong="#112233" brandOn="#ffffff" />))
  expect(container.querySelectorAll('li')).toHaveLength(4)
  for (const check of container.querySelectorAll('li')) expect(check.textContent).toContain('Vorhanden')
  expect(container.textContent).toContain('01.06.2027, 10:00')
  expect(container.textContent).toContain('01.07.2027, 18:00')
})

it('copies the real public registration page and reports clipboard errors', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await act(() => root.render(<CampPublicationCard orgSlug="review" org={{ ...org, site_published: true }} camp={{ ...camp, status: 'published' }} pending={false} brandStrong="#112233" brandOn="#ffffff" />))
  const copy = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Anmeldelink kopieren')!
  await act(async () => copy.click())
  expect(writeText).toHaveBeenCalledWith(new URL('/pilot/review', window.location.origin).href)
  expect(container.textContent).toContain('Anmeldelink kopiert.')
  writeText.mockRejectedValue(new Error('denied'))
  await act(async () => copy.click())
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Kopieren nicht möglich')
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Bitte öffnen Sie die Elternseite')
  expect(container.querySelector('a[href="/pilot/review"]')?.textContent).toBe('Elternseite öffnen')
  expect(container.textContent).not.toContain('Anmeldelink kopiert.')
})
