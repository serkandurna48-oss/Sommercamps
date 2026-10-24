import { expect, it } from 'vitest'
import { prefillCampDuplicate, DUPLICATE_MISSING, DUPLICATE_SUCCESS } from './campDuplicate'
import type { CampAdmin } from '../../../lib/saasAdminApi'

const source: CampAdmin = {
  id: 'source-id', organization_id: 'org-id', slug: 'alter-link', title: 'Fußballcamp',
  start_date: '2026-07-06', end_date: '2026-07-10', status: 'published',
  registration_start: '2026-01-01T08:00:00Z', registration_end: '2026-06-30T16:00:00Z',
  age_min: 0, age_max: 13, capacity: 50, price_cents: 19995, currency: 'EUR',
  location: 'Sportplatz', care_info: 'Ab 8 Uhr', meals_info: 'Mittagessen', includes: ['Trikot', 'Ball'],
}

it('kopiert alle Camp-Felder außer Identität, Termin, Titel, Slug und Status', () => {
  const copy = prefillCampDuplicate(source)
  expect(copy).toEqual({
    title: 'Fußballcamp (Kopie)', slug: 'fussballcamp-kopie', start_date: '', end_date: '', status: 'draft',
    registration_start: source.registration_start, registration_end: source.registration_end,
    age_min: 0, age_max: 13, capacity: 50, price_cents: 19995, currency: 'EUR',
    location: 'Sportplatz', care_info: 'Ab 8 Uhr', meals_info: 'Mittagessen', includes: ['Trikot', 'Ball'],
  })
  copy.includes!.push('Flasche')
  expect(source.includes).toEqual(['Trikot', 'Ball'])
  expect(source.start_date).toBe('2026-07-06')
  expect(source.status).toBe('published')
})

it.each(['draft', 'published', 'closed', 'archived'] as const)('setzt auch %s auf Entwurf und leert beide Termine', status => {
  expect(prefillCampDuplicate({ ...source, status })).toMatchObject({ status: 'draft', start_date: '', end_date: '' })
})

it('erhält leere optionale Angaben', () => {
  expect(prefillCampDuplicate({ ...source, location: null, care_info: null, meals_info: null, includes: null, registration_start: null, registration_end: null }))
    .toMatchObject({ location: null, care_info: null, meals_info: null, includes: null, registration_start: null, registration_end: null })
})

it('verwendet keine Du-Anrede in neuen Hinweisen', () => {
  expect(`${DUPLICATE_MISSING} ${DUPLICATE_SUCCESS}`).not.toMatch(/\b(du|dein\w*|dir|dich|prüfe|ergänze|wähle)\b/i)
})
