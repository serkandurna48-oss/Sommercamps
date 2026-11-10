import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import { DEMO_ORG_OVERRIDES } from '../demoOrg'

/** Synthetic demo club and camps for /demo/verein. Everything is invented; no backend is involved. */
export const demoOrganization: OrganizationPublic = {
  slug: DEMO_ORG_OVERRIDES.slug,
  name: DEMO_ORG_OVERRIDES.name,
  legal_name: DEMO_ORG_OVERRIDES.legal_name,
  legal_address: DEMO_ORG_OVERRIDES.legal_address,
  contact_person_name: DEMO_ORG_OVERRIDES.contact_person_name,
  contact_email: DEMO_ORG_OVERRIDES.contact_email,
  contact_phone: null,
  logo_url: null,
  primary_color: '#1F6F4A',
  theme: 'tradition',
  intro_heading: 'Ferien, Fußball, Freunde',
  intro_text: 'Bei uns lernen Kinder von 7 bis 13 Jahren Technik, Teamgeist und Freude am Spiel. Erfahrene Trainerinnen und Trainer begleiten jedes Camp.',
  hero_image_url: null,
  trainer_image_url: null,
  trainer_text: null,
  terms_text: null,
  // Offizielle Beispiel-IBAN, kein echtes Konto.
  iban: 'DE89 3704 0044 0532 0130 00',
  registration_questions: [],
  modules: ['camps'],
}

function dateAt(now: Date, days: number): string {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Two camps, always in the future relative to `now` so the page never shows an empty list. */
export function demoCamps(now = new Date()): CampPublic[] {
  const common = {
    image_url: null,
    registration_start: null,
    registration_end: null,
    age_min: 7,
    age_max: 13,
    currency: 'EUR',
    registration_open: true,
    location: 'Sportpark Wolkenfeld',
    care_info: 'Montag bis Freitag, 9–16 Uhr',
    meals_info: 'Mittagessen, Obst und Wasser inklusive',
    includes: ['Techniktraining', 'Camp-Trikot', 'Abschlussturnier'],
    waitlist_count: 0,
    is_full: false,
  } satisfies Partial<CampPublic>
  return [
    { ...common, slug: 'technikcamp', title: 'Technikcamp für Einsteiger', description: 'Eine Woche Fußball von morgens bis nachmittags: Technik, kleine Spiele und ein Abschlussturnier.',
      start_date: dateAt(now, 60), end_date: dateAt(now, 64), capacity: 24, price_cents: 18900, registered_count: 16, spots_remaining: 8 },
    { ...common, slug: 'ballgefuehl', title: 'Camp Ballgefühl', description: 'Für alle, die ihr Ballgefühl verbessern wollen. Kleine Gruppen, viel Spielzeit.',
      start_date: dateAt(now, 100), end_date: dateAt(now, 104), capacity: 12, price_cents: 14900, registered_count: 9, spots_remaining: 3 },
  ]
}
