// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'
import { loadCampAdminData, loadOrgAdminData } from './orgAdminData'
import { berlinDay, registrationTime, todayRegistrations } from './registrationDates'
import { campTabs, orgTabs } from './navTabs'
import type { Task } from './dashboardLogic'
import ParticipantList from './data/ParticipantList'
import TodayRegistrations from './data/TodayRegistrations'
import TaskCard from './tasks/TaskCard'
import TaskRow from './tasks/TaskRow'
import OrgDashboardPage from '../../pilot/[org]/(org-admin)/dashboard/page'
import CampPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/page'
import PaymentsPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/zahlungen/page'
import WaitlistPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/warteliste/page'
import TasksPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/aufgaben/page'
import ConfigPage from '../../pilot/[org]/(org-admin)/camps/[campSlug]/konfiguration/page'
import NewRegistrationsPage from '../../pilot/[org]/(org-admin)/anmeldungen/page'

vi.mock('./orgAdminData', () => ({ loadOrgAdminData: vi.fn(), loadCampAdminData: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/dashboard' }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>, useLinkStatus: () => ({ pending: false }) }))
vi.mock('./shell/OrgSwitcher', () => ({ default: () => <span>Testverein</span> }))
vi.mock('./shell/LogoutButton', () => ({ default: () => <button>Abmelden</button> }))
vi.mock('./data/ParticipantDetail', () => ({ default: () => null }))
vi.mock('./actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))
vi.mock('./actions/waitlistActions', () => ({ promoteWaitlistAction: vi.fn() }))
vi.mock('./config/CampConfigForm', () => ({ default: () => <div>Campformular</div> }))

const camp: CampAdmin = {
  id: 'camp', organization_id: 'org', slug: 'herbst', title: 'Herbstcamp', start_date: '2026-10-25', end_date: '2026-10-30',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12, capacity: 20, price_cents: 10000,
  currency: 'EUR', location: null, care_info: null, meals_info: null, includes: null, status: 'published',
}
function registration(id: string, created_at: string, overrides: Partial<RegistrationAdmin> = {}): RegistrationAdmin {
  return {
    id, registration_token: `token-${id}`, payment_reference: `CP-${id}`, status: 'registered', payment_status: 'paid',
    parent_first_name: 'Test', parent_last_name: 'Eltern', parent_email: 'test@example.com', parent_phone: '123',
    child_first_name: id, child_last_name: 'Kind', child_birth_date: '2018-01-01', emergency_contact_name: 'Kontakt',
    emergency_contact_phone: '456', medical_notes: null, allergies: null, jersey_size: null, pickup_authorized: null,
    photo_permission: false, created_at, ...overrides,
  }
}
const now = new Date('2026-10-21T12:00:00Z')
const entries = [
  registration('Alt', '2026-10-20T21:59:59Z'),
  registration('Mitternacht', '2026-10-20T22:00:00Z'),
  registration('Berta', '2026-10-21T08:42:00Z'),
  registration('Anna', '2026-10-21T09:00:00Z'),
  registration('Zoe', '2026-10-21T10:00:00Z'),
]
const org = { id: 'org', slug: 'demo', name: 'Testverein', logo_url: null, primary_color: '#116644' } as Awaited<ReturnType<typeof loadOrgAdminData>>['org']
function markup(element: React.ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(element)
  return container
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  vi.mocked(loadOrgAdminData).mockResolvedValue({ token: 'test', org, camps: [camp], registrationsByCamp: [entries] })
  vi.mocked(loadCampAdminData).mockResolvedValue({ token: 'test', org, camp, registrations: entries })
})
afterEach(() => vi.useRealTimers())

describe('daily overview', () => {
  it('uses Berlin midnight, excludes future/invalid timestamps and sorts across camps', () => {
    const secondCamp = { ...camp, slug: 'winter', title: 'Wintercamp' }
    const result = todayRegistrations([camp, secondCamp], [entries, [registration('Extra', '2026-10-21T11:00:00Z'), registration('Future', '2026-10-21T13:00:00Z'), registration('Invalid', 'invalid')]], now)
    expect(result.map(e => e.registration.child_first_name)).toEqual(['Extra', 'Zoe', 'Anna', 'Berta', 'Mitternacht'])
    expect(result[0].camp.title).toBe('Wintercamp')
    expect(registrationTime(entries[2].created_at)).toBe('10:42')
  })
  it('handles winter time and both repeated hours on the DST change', () => {
    expect(berlinDay(new Date('2026-12-01T23:00:00Z'))).toBe('2026-12-02')
    expect(registrationTime('2026-10-25T00:30:00Z')).toBe('02:30')
    expect(registrationTime('2026-10-25T01:30:00Z')).toBe('02:30')
  })
  it('renders the count and last three arrivals directly before tasks', async () => {
    const dom = markup(await OrgDashboardPage({ params: Promise.resolve({ org: 'demo' }) }))
    const block = dom.querySelector('main > section')!
    expect(block.textContent).toContain('Heute neu: 4 Anmeldungen')
    expect(block.querySelectorAll('li')).toHaveLength(3)
    expect(block.textContent).toContain('Berta Kind · Herbstcamp · heute, 10:42')
    expect(block.textContent).not.toContain('Mitternacht')
    expect(block.querySelector('a[href="/pilot/demo/anmeldungen"]')).not.toBeNull()
  })
  it('opens the complete cross-camp list including the fourth arrival', async () => {
    const dom = markup(await NewRegistrationsPage({ params: Promise.resolve({ org: 'demo' }) }))
    expect(dom.querySelectorAll('li')).toHaveLength(4)
    expect(dom.textContent).toContain('Mitternacht')
    expect(dom.textContent).not.toContain('Alt Kind')
  })
  it('distinguishes no arrivals today from no camps', async () => {
    expect(markup(<TodayRegistrations entries={[]} orgSlug="demo" />).textContent).toContain('Heute noch keine neuen Anmeldungen')
    vi.mocked(loadOrgAdminData).mockResolvedValue({ token: 'test', org, camps: [], registrationsByCamp: [] })
    const dom = markup(await OrgDashboardPage({ params: Promise.resolve({ org: 'demo' }) }))
    expect(dom.textContent).toContain('Dein erstes Camp vorbereiten')
    expect(dom.textContent).not.toContain('Alles erledigt')
    expect(dom.querySelector('a[href="/pilot/demo/camps/new"]')?.textContent).toBe('Camp anlegen')
  })
  it('keeps the done state for an existing camp without tasks', async () => {
    vi.mocked(loadOrgAdminData).mockResolvedValue({ token: 'test', org, camps: [camp], registrationsByCamp: [[]] })
    expect(markup(await OrgDashboardPage({ params: Promise.resolve({ org: 'demo' }) })).textContent).toContain('Alles erledigt')
  })
})

describe('camp navigation and task destinations', () => {
  it.each([CampPage, PaymentsPage, WaitlistPage, TasksPage, ConfigPage])('offers the parent backlink above the title on every camp page (%#)', async Page => {
    const dom = markup(await Page({ params: Promise.resolve({ org: 'demo', campSlug: 'herbst' }), searchParams: Promise.resolve({}) }))
    const link = [...dom.querySelectorAll('header a')].find(a => a.textContent === '← Zurück')!
    expect(link.getAttribute('href')).toBe(Page === CampPage ? '/pilot/demo/dashboard' : '/pilot/demo/camps/herbst')
    expect(link.className).toContain('min-h-[44px]')
    const heading = dom.querySelector('h1')!
    expect(heading.textContent).toBe(Page === ConfigPage ? 'Camp-Einstellungen' : 'Herbstcamp')
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('names the two settings destinations explicitly', () => {
    expect(orgTabs('demo').at(-1)?.label).toBe('Einstellungen')
    expect(campTabs('demo', 'herbst').at(-1)?.label).toBe('Einstellungen')
  })
  it.each([
    ['payment', '/zahlungen?filter=open'], ['missing-contact', '?filter=missing-info'], ['waitlist', '/warteliste'],
  ] as const)('links both task variants to the %s work view', (kind, suffix) => {
    const task: Task = { id: kind, kind, campSlug: 'herbst', campTitle: 'Herbstcamp', count: 1, priority: 1 }
    for (const element of [<TaskCard key="card" task={task} orgSlug="demo" brandStrong="#116644" brandOn="#fff" />, <TaskRow key="row" task={task} orgSlug="demo" />]) {
      expect(markup(element).querySelector('a')?.getAttribute('href')).toBe(`/pilot/demo/camps/herbst${suffix}`)
    }
  })
  it('applies task filters on arrival, including payment status semantics', async () => {
    vi.mocked(loadCampAdminData).mockResolvedValue({ token: 'test', org, camp, registrations: [
      registration('Offen', '2026-10-21T08:00:00Z', { payment_status: 'open', emergency_contact_name: null, emergency_contact_phone: null }),
      registration('Bezahlt', '2026-10-21T09:00:00Z'),
      registration('Wartend', '2026-10-21T10:00:00Z', { payment_status: 'open', status: 'waitlist', emergency_contact_name: null, emergency_contact_phone: null }),
      registration('Storniert', '2026-10-21T10:30:00Z', { payment_status: 'open', status: 'cancelled', emergency_contact_name: null, emergency_contact_phone: null }),
    ] })
    const props = { params: Promise.resolve({ org: 'demo', campSlug: 'herbst' }) }
    const contacts = markup(await CampPage({ ...props, searchParams: Promise.resolve({ filter: 'missing-info' }) }))
    expect(contacts.querySelectorAll('.cp-roster-row')).toHaveLength(1)
    expect(contacts.querySelector('.cp-roster')?.textContent).toContain('Offen Kind')
    const payments = markup(await PaymentsPage({ ...props, searchParams: Promise.resolve({ filter: 'open' }) }))
    expect(payments.querySelector('.cp-roster')?.textContent).toContain('Offen Kind')
    expect(payments.querySelector('.cp-roster')?.textContent).not.toContain('Bezahlt Kind')
    expect(payments.querySelector('.cp-roster')?.textContent).not.toContain('Wartend Kind')
  })
})

it('sorts participants by arrival, shows the Berlin date and switches to names', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(() => root.render(<ParticipantList camp={camp} registrations={entries.slice(2)} orgSlug="demo" campSlug="herbst" brandColor="#116644" />))
    expect(container.querySelector('.cp-roster-row')?.textContent).toContain('Zoe Kind')
    expect(container.textContent).toContain('Eingang: 21.10.2026, 10:42')
    const sort = container.querySelector<HTMLSelectElement>('select[aria-label=Sortierung]')!
    expect(sort.textContent).toContain('Neueste zuerst')
    await act(() => { sort.value = 'name'; sort.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('.cp-roster-row')?.textContent).toContain('Anna Kind')
  } finally {
    await act(() => root.unmount())
  }
})
