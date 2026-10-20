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

const campDefaults: CampAdmin = {
  id: 'preview-camp-1', organization_id: organization.id, slug: 'technikcamp',
  title: 'Technikcamp Herbst', start_date: '2027-10-25', end_date: '2027-10-29',
  registration_start: '2027-01-01T08:00:00Z', registration_end: '2027-10-20T16:00:00Z',
  age_min: 7, age_max: 13, capacity: 16, price_cents: 18900, currency: 'EUR',
  location: 'Sportpark Wolkenfeld', care_info: 'Montag bis Freitag, 9–16 Uhr',
  meals_info: 'Mittagessen, Obst und Wasser inklusive',
  includes: ['Techniktraining', 'Camp-Trikot', 'Abschlussturnier'], status: 'published',
}

export const camps: CampAdmin[] = [
  campDefaults,
  { ...campDefaults, id: 'preview-camp-2', slug: 'wintercamp', title: 'Wintercamp Ballgefühl',
    start_date: '2027-12-27', end_date: '2027-12-30', registration_end: '2027-12-20T16:00:00Z', capacity: 12, price_cents: 14900 },
  { ...campDefaults, id: 'preview-camp-3', slug: 'fruehlingscamp', title: 'Frühlingscamp Talente',
    start_date: '2028-04-10', end_date: '2028-04-14', registration_start: null, registration_end: null,
    capacity: 24, status: 'draft' },
]

const firstNames = ['Lio', 'Mila', 'Jona', 'Nele', 'Finn', 'Alva', 'Tamo', 'Lina', 'Miro', 'Svea', 'Niko', 'Fina', 'Levi', 'Tilda', 'Enno', 'Runa', 'Jari', 'Malin', 'Luan', 'Elin', 'Arvid', 'Nola', 'Kian', 'Ylva', 'Lenn', 'Mina', 'Tilo', 'Liv']
const lastNames = ['Wolkenfeld', 'Sonnenbach', 'Lindenfels', 'Wiesenau', 'Birkenhain', 'Falkental', 'Morgenried']

export const registrations: RegistrationAdmin[] = firstNames.map((name, i) => {
  const cancelled = i === 26 || i === 27
  const waiting = i >= 16 && i < 20
  return {
    id: `preview-registration-${i + 1}`, registration_token: `preview-token-${i + 1}`,
    status: cancelled ? 'cancelled' : waiting ? 'waitlist' : i % 3 === 0 ? 'registered' : 'confirmed',
    payment_status: cancelled ? (i === 26 ? 'refunded' : 'cancelled') : waiting ? 'open' : i % 5 === 0 ? 'waived' : i % 3 === 0 ? 'open' : 'paid',
    child_first_name: name, child_last_name: lastNames[i % lastNames.length],
    child_birth_date: `${2015 + i % 5}-05-12`,
    parent_first_name: i % 2 ? 'Jule' : 'Tammo', parent_last_name: lastNames[i % lastNames.length],
    parent_email: `familie${i + 1}@campspilot.example`, parent_phone: '',
    emergency_contact_name: i % 6 === 0 ? null : `Jule ${lastNames[i % lastNames.length]}`,
    emergency_contact_phone: null,
    allergies: i % 9 === 0 ? 'Beispiel: Nüsse' : null, medical_notes: i === 2 ? 'Beispiel: zusätzliche Trinkpausen' : null,
    jersey_size: ['128', '140', '152'][i % 3], pickup_authorized: 'Erziehungsberechtigte',
    photo_permission: i % 4 !== 0, created_at: `2027-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
  }
})

export function getPreviewFixtures(empty = false) {
  return {
    orgSlug: organization.slug,
    org: empty ? { ...organization, camp_count: 0 } : organization,
    camps: empty ? [] : camps,
    // 16 active + 4 waiting + 2 cancelled; second camp has 6/12 active places.
    registrationsByCamp: empty ? [] : [[...registrations.slice(0, 20), ...registrations.slice(26)], registrations.slice(20, 26), []],
  }
}
