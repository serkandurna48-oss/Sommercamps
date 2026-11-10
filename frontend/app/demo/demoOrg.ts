import type { OrganizationAdmin } from '../lib/saasAdminApi'

/** Fully synthetic demo club for the public demos (/demo/dashboard, /demo/verein). No real club, person or contact data. */
export const DEMO_ORG_SLUG = 'fc-beispielstadt'

export const DEMO_ORG_OVERRIDES = {
  slug: DEMO_ORG_SLUG,
  name: 'FC Beispielstadt',
  legal_name: 'FC Beispielstadt e. V.',
  legal_address: 'Beispielweg 12, 00000 Beispielstadt',
  contact_email: 'camps@fc-beispielstadt.example',
  contact_person_name: 'Mara Wolkenfeld',
  logo_url: null,
  primary_color: '#E8672B',
  theme: 'tradition',
  billing_notes: 'Demo-Verein mit erfundenen Daten',
} satisfies Partial<OrganizationAdmin>

/** Swap the organisation of a fixture set for the demo club. */
export function withDemoOrg<T extends { orgSlug: string; org: OrganizationAdmin }>(fixtures: T): T {
  return { ...fixtures, orgSlug: DEMO_ORG_SLUG, org: { ...fixtures.org, ...DEMO_ORG_OVERRIDES } }
}
