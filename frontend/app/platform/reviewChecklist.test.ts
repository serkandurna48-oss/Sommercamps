import { describe, expect, it } from 'vitest'
import { computeReviewChecklist, exactReviewDate, relativeReviewDate, submittedOrganizations } from './reviewChecklist'
import { reviewCamp, reviewOrg } from './reviewFixtures'

describe('Freigabecheckliste', () => {
  it('prüft dieselben Pflichtangaben wie der Einrichtungsassistent des Vereins', () => {
    const items = computeReviewChecklist(reviewOrg, [reviewCamp])
    expect(items.map(item => item.id)).toEqual(['color', 'email', 'address', 'terms', 'camp'])
    expect(items.every(item => item.done)).toBe(true)
  })

  it.each([
    ['primary_color', 'color'], ['contact_email', 'email'],
    ['legal_address', 'address'], ['terms_text', 'terms'],
  ])('erkennt fehlendes Feld %s unabhängig von den übrigen Angaben', (field, id) => {
    for (const missing of [null, '', '  \n ']) {
      const items = computeReviewChecklist({ ...reviewOrg, [field]: missing }, [reviewCamp])
      expect(items.filter(item => !item.done).map(item => item.id)).toEqual([id])
    }
  })

  // Prod check 18.11.2026: the club wizard accepts colour without logo, the
  // review then blocked with "Fehlt: Logo" - a club could not know.
  it('verlangt kein Logo, das der Verein nirgends als Pflicht sieht', () => {
    const items = computeReviewChecklist({ ...reviewOrg, logo_url: null }, [reviewCamp])
    expect(items.every(item => item.done)).toBe(true)
  })

  it('erkennt ein fehlendes Camp', () => {
    expect(computeReviewChecklist(reviewOrg, []).find(item => item.id === 'camp')?.done).toBe(false)
  })

  it.each([
    { start_date: '' }, { end_date: '' }, { start_date: 'ungültig' },
    { end_date: '2027-07-01' }, { price_cents: undefined },
    { price_cents: null }, { price_cents: -1 }, { price_cents: NaN }, { price_cents: 1.5 },
  ])('lehnt unvollständige/ungültige Campangaben ab: %j', patch => {
    const camp = { ...reviewCamp, ...patch } as typeof reviewCamp
    expect(computeReviewChecklist(reviewOrg, [camp]).find(item => item.id === 'camp')?.done).toBe(false)
  })

  it('verlangt Termine und Preis im selben Camp; kostenlose Camps zählen', () => {
    const split = [{ ...reviewCamp, end_date: '' }, { ...reviewCamp, price_cents: NaN }]
    expect(computeReviewChecklist(reviewOrg, split).at(-1)?.done).toBe(false)
    expect(computeReviewChecklist(reviewOrg, [...split, { ...reviewCamp, price_cents: 0 }]).at(-1)?.done).toBe(true)
  })
})

it('sortiert nur eingereichte Vereine chronologisch, ohne die Eingabe zu verändern', () => {
  const newest = { ...reviewOrg, slug: 'neu', submitted_at: '2026-10-21T08:00:00+02:00' }
  const oldest = { ...reviewOrg, slug: 'alt', submitted_at: '2026-10-19T23:00:00Z' }
  const invalid = { ...reviewOrg, slug: 'unbekannt', submitted_at: null }
  const approved = { ...reviewOrg, slug: 'fertig', review_status: 'approved' }
  const orgs = [newest, invalid, approved, oldest]
  expect(submittedOrganizations(orgs).map(org => org.slug)).toEqual(['alt', 'neu', 'unbekannt'])
  expect(orgs[0]).toBe(newest)
})

it('formatiert relativen Zeitpunkt und exaktes Datum mit expliziter Zeitzone', () => {
  expect(relativeReviewDate(reviewOrg.submitted_at, Date.parse('2026-10-20T13:00:00Z'))).toBe('vor 3 Std.')
  expect(exactReviewDate(reviewOrg.submitted_at)).toBe('20.10.2026, 12:00 Uhr (Berlin)')
  expect(relativeReviewDate(null, 0)).toBe('Nicht angegeben')
  expect(exactReviewDate('falsch')).toBe('Nicht angegeben')

})
