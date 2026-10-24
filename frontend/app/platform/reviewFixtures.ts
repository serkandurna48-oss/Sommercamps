import type { OrganizationAdmin } from '../lib/saasAdminApi'
import type { ReviewCamp } from './reviewChecklist'

// Synthetic data shared by review tests; never used by production routes.
export const reviewOrg: OrganizationAdmin = {
  id: 'org-1', slug: 'test-verein', name: 'Test Verein',
  legal_name: 'Test Verein e.V.', legal_address: 'Teststraße 1, 12345 Teststadt',
  contact_email: 'kontakt@example.test', contact_phone: null, contact_person_name: 'Alex Beispiel',
  logo_url: '/test-logo.svg', primary_color: '#123456', plan_status: 'pilot', theme: 'tradition',
  iban: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: 'Teilnahme nur nach Anmeldung.',
  site_published: false, review_status: 'submitted', submitted_at: '2026-10-20T10:00:00Z',
  avv_version: '2026-v1', avv_accepted_at: '2026-10-19T08:30:00Z', review_note: null, approved_at: null,
}

export const reviewCamp: ReviewCamp = {
  start_date: '2027-07-12', end_date: '2027-07-16', price_cents: 15000, status: 'draft',
}
