// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import SubmittedOrgsSection from './SubmittedOrgsSection'
import ReviewNavLink from './ReviewNavLink'
import { reviewCamp, reviewOrg } from '../reviewFixtures'

const loadedAt = Date.parse('2026-10-20T13:00:00Z')
function renderList(orgs = [reviewOrg]) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<SubmittedOrgsSection orgs={orgs} loadedAt={loadedAt}
    campsByOrg={{ [reviewOrg.slug]: [reviewCamp, { ...reviewCamp, status: 'published' }] }} />)
  return container
}

it('zeigt Kontakt, beide Zeitpunkte, AVV-Version und getrennte Campzahlen', () => {
  const container = renderList()
  expect(container.textContent).toContain('Alex Beispiel · kontakt@example.test')
  expect(container.textContent).toContain('AVV 2026-v1')
  expect(container.textContent).toContain('Angenommen: 19.10.2026, 10:30 Uhr (Berlin)')
  expect(container.textContent).toContain('2 gesamt · 1 Entwurf · 1 veröffentlicht')
  expect(container.textContent).toContain('6/6 Prüfpunkte vollständig')
  expect(container.querySelector('time')?.textContent).toBe('vor 3 Std.')
  expect(container.querySelector('time')?.title).toBe('20.10.2026, 12:00 Uhr (Berlin)')
})

it('zeigt fehlendes Logo als roten Chip mit Text', () => {
  const container = renderList([{ ...reviewOrg, logo_url: null }])
  const chip = container.querySelector<HTMLElement>('li')!
  expect(chip.textContent).toBe('Fehlt: Logo')
  expect(chip.style.color).toBe('var(--cp-error)')
  expect(chip.style.background).toBe('var(--cp-error-bg)')
  expect(container.textContent).toContain('5/6 Prüfpunkte vollständig')
})

it('rendert die älteste Einreichung zuerst und lässt andere Status weg', () => {
  const container = renderList([
    { ...reviewOrg, slug: 'neu', name: 'Neuer Verein', submitted_at: '2026-10-21T10:00:00Z' },
    { ...reviewOrg, slug: 'fertig', name: 'Fertiger Verein', review_status: 'approved' },
    { ...reviewOrg, slug: 'alt', name: 'Alter Verein', submitted_at: '2026-10-19T10:00:00Z' },
  ])
  expect([...container.querySelectorAll('h3')].map(el => el.textContent)).toEqual(['Alter Verein', 'Neuer Verein'])
})

it.each([0, 1, 3])('zeigt %s offene Freigaben im Navigationsbadge', count => {
  const orgs = Array.from({ length: count }, (_, i) => ({ ...reviewOrg, slug: `verein-${i}` }))
  orgs.push(...['draft', 'approved', 'rejected'].map(review_status => ({ ...reviewOrg, review_status })))
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<ReviewNavLink orgs={orgs} />)
  expect(container.querySelector('span')?.textContent).toBe(String(count))
  expect(container.querySelector('a')?.getAttribute('aria-label')).toBe(`Freigaben: ${count} warten auf Freigabe`)
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/platform#freigaben')
})
