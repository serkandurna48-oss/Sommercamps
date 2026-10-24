import type { CampAdmin } from '../../../lib/saasAdminApi'

export type CampDuplicate = Omit<CampAdmin, 'id' | 'organization_id'>

export function suggestCampSlug(title: string): string {
  return title.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function prefillCampDuplicate(source: CampAdmin): CampDuplicate {
  return {
    title: `${source.title} (Kopie)`,
    slug: suggestCampSlug(`${source.title} (Kopie)`),
    start_date: '',
    end_date: '',
    status: 'draft',
    age_min: source.age_min,
    age_max: source.age_max,
    capacity: source.capacity,
    price_cents: source.price_cents,
    currency: source.currency,
    registration_start: source.registration_start,
    registration_end: source.registration_end,
    location: source.location,
    care_info: source.care_info,
    meals_info: source.meals_info,
    includes: source.includes === null ? null : [...source.includes],
  }
}

export const DUPLICATE_SUCCESS = 'Kopie angelegt – bitte Termin prüfen und veröffentlichen.'
export const DUPLICATE_MISSING = 'Das ursprüngliche Camp wurde nicht gefunden. Sie können ein neues Camp anlegen.'
