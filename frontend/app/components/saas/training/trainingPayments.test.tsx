// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { organization } from '../../../dev/admin-vorschau/fixtures'
import type { RegistrationAdmin, TrainingOffer, TrainingSessionAdmin } from '../../../lib/saasAdminApi'
import OrgPaymentsScreen from '../screens/OrgPaymentsScreen'
import { trainingPaymentGroup } from './trainingPayments'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/zahlungen' }))
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))
vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

const org = { ...organization, name: 'Testverein', slug: 'demo', logo_url: null, primary_color: null }
const offer = { id: 'o1', title: 'Einzeltraining Technik', kind: 'einzel' } as TrainingOffer
const session: TrainingSessionAdmin = {
  id: 's1', offer_id: 'o1', slug: 'einzel-2026-03-29-1800', status: 'published',
  starts_at: '2026-03-29T16:00:00Z', ends_at: '2026-03-29T16:45:00Z', local_date: '2026-03-29', local_time: '18:00',
  capacity: 1, booked_count: 1, free_spots: 0, price_member_cents: 3000, price_nonmember_cents: 4050, age_min: 4, age_max: 18, location: null,
}
const reg = (patch: Partial<RegistrationAdmin>): RegistrationAdmin => ({
  id: 'r1', registration_token: 'tok', payment_reference: 'CP-TRAIN01', status: 'registered', payment_status: 'open',
  parent_first_name: 'Erika', parent_last_name: 'Beispiel', parent_email: 'e@example.test', parent_phone: '0',
  child_first_name: 'Kind', child_last_name: 'Beispiel', child_birth_date: '2016-05-01',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null, jersey_size: null,
  pickup_authorized: null, photo_permission: false, created_at: '2026-03-01T10:00:00Z',
  applied_price_cents: 3000, member_match: true, payment_method: 'bar', ...patch,
})

describe('Trainingszahlungen', () => {
  it('zeigt einen Hinweis, wenn Trainingszahlungen nicht geladen werden konnten', () => {
    const html = renderToStaticMarkup(
      <OrgPaymentsScreen orgSlug="demo" org={org} camps={[]} registrationsByCamp={[]} trainingPaymentsError />,
    )
    expect(html).toContain('Trainingszahlungen konnten nicht geladen werden.')
  })

  it('bildet einen Termin als Zahlungsgruppe mit Berliner Ortszeit im Titel ab', () => {
    const group = trainingPaymentGroup(offer, session, [reg({})])
    expect(group.camp.slug).toBe('einzel-2026-03-29-1800')
    expect(group.camp.title).toBe('Einzeltraining Technik · 29.03.2026, 18:00 Uhr')
    expect(group.camp.price_cents).toBe(4050)
    expect(group.camp.currency).toBe('EUR')
  })

  it('Zahlungsseite zeigt Trainingsbuchung mit Zahlart, angewandtem Preis und summiert sie', () => {
    const groups = [trainingPaymentGroup(offer, session, [
      reg({}),
      reg({ id: 'r2', registration_token: 'tok2', payment_reference: 'CP-TRAIN02', applied_price_cents: 4050, payment_method: 'ueberweisung', member_match: false }),
      reg({ id: 'r3', registration_token: 'tok3', payment_reference: 'CP-TRAIN03', payment_status: 'paid', applied_price_cents: 2500 }),
    ])]
    const html = renderToStaticMarkup(
      <OrgPaymentsScreen orgSlug="demo" org={org} camps={[]} registrationsByCamp={[]} trainingPayments={groups} />,
    )
    expect(html).toContain('Einzeltraining Technik · 29.03.2026, 18:00 Uhr')
    expect(html).not.toContain('Zahlart')
    expect(html).toContain('Über alle Camps und Trainings')
    expect(html.replace(/ /g, ' ')).toContain('40,50')
    expect(html.replace(/ /g, ' ')).toContain('30,00')
  })
})
