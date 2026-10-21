import type { CampAdmin, OrganizationAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

// All people and contact details are invented; no production data is used.
export const organization: OrganizationAdmin = {
  id: 'preview-organization', slug: 'jk-performance-academy',
  name: 'JK Performance Academy', legal_name: 'JK Performance Academy',
  legal_address: 'Beispielweg 12, 00000 Musterstadt',
  contact_email: 'team@campspilot.example', contact_phone: null,
  contact_person_name: 'Mara Wolkenfeld', logo_url: '/jk/logo.jpg',
  primary_color: '#B8912B', plan_status: 'active', theme: 'akademie',
  iban: null, intro_heading: 'Gemeinsam am Ball wachsen',
  intro_text: 'Technik, Teamgeist und Freude am Fußball.',
  hero_image_url: null, trainer_image_url: null, trainer_text: null,
  terms_text: 'Dies sind erfundene Beispieldaten für die lokale Vorschau.',
  billing_notes: 'Beispielverein für die Dev-Vorschau', site_published: true, camp_count: 3,
}

function dateAt(now: Date, days: number): string {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function makeCamps(now: Date): CampAdmin[] {
const campDefaults: CampAdmin = {
  id: 'preview-camp-1', organization_id: organization.id, slug: 'technikcamp',
  title: 'Technikcamp Herbst', start_date: dateAt(now, 75), end_date: dateAt(now, 79),
  registration_start: dateAt(now, -45) + 'T08:00:00Z', registration_end: dateAt(now, 70) + 'T16:00:00Z',
  age_min: 7, age_max: 13, capacity: 16, price_cents: 18900, currency: 'EUR',
  location: 'Sportpark Wolkenfeld', care_info: 'Montag bis Freitag, 9–16 Uhr',
  meals_info: 'Mittagessen, Obst und Wasser inklusive',
  includes: ['Techniktraining', 'Camp-Trikot', 'Abschlussturnier'], status: 'published',
}

return [
  campDefaults,
  { ...campDefaults, id: 'preview-camp-2', slug: 'wintercamp', title: 'Wintercamp Ballgefühl',
    start_date: dateAt(now, 100), end_date: dateAt(now, 104), registration_end: dateAt(now, 95) + 'T16:00:00Z', capacity: 12, price_cents: 14900 },
  { ...campDefaults, id: 'preview-camp-3', slug: 'fruehlingscamp', title: 'Frühlingscamp Talente',
    start_date: dateAt(now, 115), end_date: dateAt(now, 119), registration_start: null, registration_end: null,
    capacity: 24, status: 'draft' },
]
}

export const camps = makeCamps(new Date())

const firstNames = ['Lio', 'Mila', 'Jona', 'Nele', 'Finn', 'Alva', 'Tamo', 'Lina', 'Miro', 'Svea', 'Niko', 'Fina', 'Levi', 'Tilda', 'Enno', 'Runa', 'Jari', 'Malin', 'Luan', 'Elin', 'Arvid', 'Nola', 'Kian', 'Ylva', 'Lenn', 'Mina', 'Tilo', 'Liv']
const lastNames = ['Wolkenfeld', 'Sonnenbach', 'Lindenfels', 'Wiesenau', 'Birkenhain', 'Falkental', 'Morgenried']

function makeRegistrations(now: Date): RegistrationAdmin[] {
return firstNames.map((name, i) => {
  const cancelled = i === 26 || i === 27
  const waiting = i >= 16 && i < 20
  return {
    id: `preview-registration-${i + 1}`, registration_token: `preview-token-${i + 1}`, payment_reference: `CP-PV${String(i + 1).padStart(6, '0')}`,
    status: cancelled ? 'cancelled' : waiting ? 'waitlist' : i % 3 === 0 ? 'registered' : 'confirmed',
    payment_status: cancelled ? (i === 26 ? 'refunded' : 'cancelled') : waiting ? 'open' : i % 5 === 0 ? 'waived' : i % 3 === 0 ? 'open' : 'paid',
    child_first_name: name, child_last_name: lastNames[i % lastNames.length],
    child_birth_date: `${now.getUTCFullYear() - 11 + i % 5}-05-12`,
    parent_first_name: i % 2 ? 'Jule' : 'Tammo', parent_last_name: lastNames[i % lastNames.length],
    parent_email: `familie${i + 1}@campspilot.example`, parent_phone: '',
    emergency_contact_name: i % 6 === 0 ? null : `Jule ${lastNames[i % lastNames.length]}`,
    emergency_contact_phone: null,
    allergies: i % 9 === 0 ? 'Beispiel: Nüsse' : null, medical_notes: i === 2 ? 'Beispiel: zusätzliche Trinkpausen' : null,
    jersey_size: ['128', '140', '152'][i % 3], pickup_authorized: 'Erziehungsberechtigte',
    photo_permission: i % 4 !== 0, created_at: dateAt(now, -(3 + i)) + 'T10:00:00Z',
  }
})

}

export const registrations = makeRegistrations(new Date())

export function getPreviewFixtures(empty = false, now = new Date()) {
  const previewRegistrations = makeRegistrations(now)
  const previewCamps = makeCamps(now)
  return {
    orgSlug: organization.slug,
    org: empty ? { ...organization, camp_count: 0 } : organization,
    camps: empty ? [] : previewCamps,
    // 16 active + 4 waiting + 2 cancelled; second camp has 6/12 active places.
    registrationsByCamp: empty ? [] : [[...previewRegistrations.slice(0, 20), ...previewRegistrations.slice(26)], previewRegistrations.slice(20, 26), []],
  }
}
