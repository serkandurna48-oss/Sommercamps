import type { CampAdmin, OrganizationAdmin } from '../lib/saasAdminApi'

export type ReviewCamp = Pick<CampAdmin, 'start_date' | 'end_date' | 'price_cents' | 'status'>
export type ReviewItem = { id: string; label: string; done: boolean }

const hasText = (value: string | null | undefined) => Boolean(value?.trim())

export function computeReviewChecklist(org: OrganizationAdmin, camps: readonly ReviewCamp[]): ReviewItem[] {
  return [
    { id: 'logo', label: 'Logo', done: hasText(org.logo_url) },
    { id: 'color', label: 'Vereinsfarbe', done: hasText(org.primary_color) },
    { id: 'email', label: 'Kontakt-E-Mail', done: hasText(org.contact_email) },
    { id: 'address', label: 'Anschrift', done: hasText(org.legal_address) },
    { id: 'terms', label: 'Teilnahmebedingungen', done: hasText(org.terms_text) },
    {
      id: 'camp', label: 'Camp mit Terminen und Preis',
      done: camps.some(camp => {
        const start = Date.parse(camp.start_date)
        const end = Date.parse(camp.end_date)
        return Number.isFinite(start) && Number.isFinite(end) && end >= start
          && Number.isInteger(camp.price_cents) && camp.price_cents >= 0
      }),
    },
  ]
}

export function submittedOrganizations(orgs: readonly OrganizationAdmin[]): OrganizationAdmin[] {
  const timestamp = (org: OrganizationAdmin) => {
    const value = Date.parse(org.submitted_at ?? '')
    return Number.isFinite(value) ? value : Infinity
  }
  return orgs.filter(org => org.review_status === 'submitted')
    .sort((a, b) => timestamp(a) - timestamp(b) || a.slug.localeCompare(b.slug, 'de'))
}

export function exactReviewDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Nicht angegeben'
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin',
  }).format(new Date(value)) + ' Uhr (Berlin)'
}

export function relativeReviewDate(value: string | null | undefined, now: number): string {
  const date = Date.parse(value ?? '')
  if (!Number.isFinite(date)) return 'Nicht angegeben'
  const minutes = Math.max(0, Math.floor((now - date) / 60_000))
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}
