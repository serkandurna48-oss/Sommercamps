// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { organization } from '../../../dev/admin-vorschau/fixtures'
import type { PlayerBooking, PlayerDetail, PlayerSummary, RegistrationAdmin, TrainingOffer, TrainingSessionAdmin } from '../../../lib/saasAdminApi'
import PlayerRecordScreen, { NO_CONSENT_HINT } from '../screens/PlayerRecordScreen'
import PlayersScreen from '../screens/PlayersScreen'
import TrainingOfferScreen from '../screens/TrainingOfferScreen'
import { createNoteAction, deleteNoteAction } from '../actions/playerActions'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/spieler' }))
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))
vi.mock('../actions/playerActions', () => ({
  createNoteAction: vi.fn(), updateNoteAction: vi.fn(), deleteNoteAction: vi.fn(), createGoalAction: vi.fn(),
  setGoalStatusAction: vi.fn(), createMeasurementAction: vi.fn(), deleteMeasurementAction: vi.fn(),
}))
vi.mock('../actions/trainingActions', () => ({
  createOfferAction: vi.fn(), updateOfferAction: vi.fn(), createSessionAction: vi.fn(), deleteSessionAction: vi.fn(),
  cancelSessionAction: vi.fn(), createMemberAction: vi.fn(), setMemberActiveAction: vi.fn(), importMembersAction: vi.fn(),
}))
vi.mock('../actions/waitlistActions', () => ({ cancelRegistrationAction: vi.fn() }))
vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

const org = { ...organization, name: 'Testverein', slug: 'demo', logo_url: null, primary_color: null }
const TODAY = '2027-04-02'
const SECRET = 'GEHEIM-Mentalnotiz-4711'

const summary = (patch: Partial<PlayerSummary>): PlayerSummary => ({
  id: 'p1', first_name: 'Lena', last_name: 'Mustermann', birth_date: '2015-03-04', age: 12, last_booking_at: '2027-03-29',
  booking_count: 2, note_count: 3, open_goal_count: 1, ...patch,
})
const booking = (patch: Partial<PlayerBooking>): PlayerBooking => ({
  registration_id: 'r1', camp_id: 'c1', kind: 'training', camp_title: 'Einzeltraining', offer_title: 'Technik 1:1',
  local_date: '2027-03-29', local_time: '18:00', status: 'confirmed', payment_status: 'open', documentation_consent: true, ...patch,
})
const record = (patch: Partial<PlayerDetail> = {}): PlayerDetail => ({
  player: { id: 'p1', first_name: 'Lena', last_name: 'Mustermann', birth_date: '2015-03-04', age: 12 },
  bookings: [booking({}), booking({ registration_id: 'r2', camp_id: 'c2', kind: 'camp', camp_title: 'Frühjahrscamp', offer_title: null, local_date: '2027-03-01', local_time: null, payment_status: 'paid' })],
  notes: [
    { id: 'n2', player_id: 'p1', camp_id: 'c1', note_date: '2027-03-29', focus: ['technik', 'mental'], body: `${SECRET}\nZweite Zeile`, rating: 4, next_steps: 'Linker Fuß', video_url: 'https://vimeo.com/1', created_at: '2027-03-29T19:00:00Z', updated_at: '2027-03-29T19:00:00Z' },
    { id: 'n1', player_id: 'p1', camp_id: null, note_date: '2027-03-01', focus: [], body: 'Ältere Notiz', rating: null, next_steps: null, video_url: 'javascript:alert(1)', created_at: '2027-03-01T19:00:00Z', updated_at: '2027-03-01T19:00:00Z' },
  ],
  goals: [
    { id: 'g1', player_id: 'p1', title: 'Linker Fuß sicherer', area: 'technik', status: 'offen', target_date: '2027-06-30', created_at: '', updated_at: '' },
    { id: 'g2', player_id: 'p1', title: 'Ausdauer', area: 'athletik', status: 'erreicht', target_date: null, created_at: '', updated_at: '' },
  ],
  measurements: [
    { id: 'm2', player_id: 'p1', measured_on: '2027-03-29', metric: 'sprint_10m', value: 2.14, unit: 's', note: null, created_at: '2027-03-29T19:00:00Z', updated_at: '' },
    { id: 'm1', player_id: 'p1', measured_on: '2027-01-10', metric: 'sprint_10m', value: 2.4, unit: 's', note: 'Halle', created_at: '2027-01-10T19:00:00Z', updated_at: '' },
    { id: 'm3', player_id: 'p1', measured_on: '2027-03-29', metric: 'standweitsprung', value: 150, unit: 'cm', note: null, created_at: '', updated_at: '' },
  ],
  metrics: [{ metric: 'sprint_10m', unit: 's' }, { metric: 'sprint_30m', unit: 's' }, { metric: 'standweitsprung', unit: 'cm' }, { metric: 'jonglieren', unit: 'Anzahl' }],
  ...patch,
})

function html(node: React.ReactElement): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = renderToStaticMarkup(node)
  return doc
}
const screen = (rec = record(), query?: Record<string, unknown>) => <PlayerRecordScreen orgSlug="demo" org={org} record={rec} query={query} today={TODAY} />

describe('Spielerliste', () => {
  const players = [summary({}), summary({ id: 'p2', first_name: 'Jörg', last_name: 'Größe', age: 1, last_booking_at: null, booking_count: 0, note_count: 1, open_goal_count: 0 })]

  it('zeigt Name, Alter, letzte Buchung, Notizen, offene Ziele und Link zur Akte', () => {
    const doc = html(<PlayersScreen orgSlug="demo" org={org} players={players} />)
    expect(doc.querySelector('h1')?.textContent).toBe('Spieler')
    const row = doc.querySelector('a[href="/pilot/demo/spieler/p1"]')!
    expect(row.textContent).toContain('Lena Mustermann')
    expect(row.textContent).toContain('12 Jahre')
    expect(row.textContent).toContain('zuletzt gebucht am 29.03.2027')
    expect(row.textContent).toContain('3 Notizen')
    expect(row.textContent).toContain('1 offenes Ziel')
    const other = doc.querySelector('a[href="/pilot/demo/spieler/p2"]')!
    expect(other.textContent).toContain('1 Jahr')
    expect(other.textContent).toContain('noch keine Buchung')
    expect(other.textContent).toContain('0 offene Ziele')
    expect(doc.querySelector('[role="search"] input[type="search"]')).not.toBeNull()
    expect(doc.querySelector('a[href="/pilot/demo/spieler"]')).not.toBeNull() // Tab
  })

  it('leerer Zustand', () => {
    expect(html(<PlayersScreen orgSlug="demo" org={org} players={[]} />).body.textContent).toContain('Noch keine Spieler.')
  })
})

describe('Spielerakte (Darstellung)', () => {
  it('Kopf mit Name und Alter, Einwilligung vorhanden: kein Hinweis', () => {
    const doc = html(screen())
    expect(doc.querySelector('h1')?.textContent).toBe('Lena Mustermann')
    expect(doc.querySelector('header')?.textContent).toContain('12 Jahre')
    expect(doc.querySelector('[data-consent-hint]')).toBeNull()
    expect(doc.body.textContent).not.toContain(NO_CONSENT_HINT)
  })

  it('zeigt den Einwilligungshinweis, wenn die jüngste Buchung keine Doku-Einwilligung hat', () => {
    for (const consent of [false, null] as const) {
      const rec = record({ bookings: [booking({ documentation_consent: consent })] })
      expect(html(screen(rec)).querySelector('[data-consent-hint]')?.textContent)
        .toBe('Keine Einwilligung zur Doku vorhanden – bitte bei den Eltern nachfragen')
    }
  })

  it('Notizen neueste zuerst mit Fokus, Bewertung, nächsten Schritten und sicherem Video-Link', () => {
    const doc = html(screen())
    const items = [...doc.querySelectorAll('li[data-note-id]')]
    expect(items.map(li => li.getAttribute('data-note-id'))).toEqual(['n2', 'n1'])
    const first = items[0]
    expect(first.textContent).toContain('29.03.2027')
    expect(first.textContent).toContain('Technik')
    expect(first.textContent).toContain('Mental')
    expect(first.textContent).toContain(SECRET)
    expect(first.textContent).toContain('Linker Fuß')
    expect(first.querySelector('[aria-label="Bewertung 4 von 5"]')).not.toBeNull()
    expect(first.querySelectorAll('[aria-hidden="true"].rounded-full')).toHaveLength(5)
    expect(first.textContent).toContain('Termin: 29.03.2027, 18:00 Uhr')
    const link = first.querySelector<HTMLAnchorElement>('a[href="https://vimeo.com/1"]')!
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    // Kein klickbarer Link für nicht-https-Werte, die irgendwie in der Datenbank stehen.
    expect(items[1].querySelector('a')).toBeNull()
    expect(items[1].textContent).not.toContain('javascript')
    expect(items[1].querySelector('[aria-label^="Bewertung"]')).toBeNull()
  })

  it('Ziele mit Status und Aktionen', () => {
    const doc = html(screen())
    const open = doc.querySelector('li[data-goal-status="offen"]')!
    expect(open.textContent).toContain('Linker Fuß sicherer')
    expect(open.textContent).toContain('bis 30.06.2027')
    expect(open.textContent).toContain('Erreicht')
    expect(open.textContent).toContain('Verwerfen')
    const done = doc.querySelector('li[data-goal-status="erreicht"]')!
    expect(done.textContent).toContain('Wieder öffnen')
    expect(doc.querySelector('form[aria-label="Ziel hinzufügen"]')).not.toBeNull()
  })

  it('Messwerte: je Metrik ein SVG-Verlauf, Sprint als „niedriger ist besser“, Werte mit Einheit', () => {
    const doc = html(screen())
    const sprint = doc.querySelector('figure[data-metric="sprint_10m"]')!
    expect(sprint.textContent).toContain('Niedriger ist besser')
    expect(sprint.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('Sprint 10 m: von 2,4 s am 10.01.2027 auf 2,14 s am 29.03.2027')
    expect(sprint.querySelector('polyline')).not.toBeNull()
    const jump = doc.querySelector('figure[data-metric="standweitsprung"]')!
    expect(jump.textContent).toContain('Höher ist besser')
    expect(jump.querySelector('polyline')).toBeNull() // ein Punkt: nur Marker
    expect(doc.querySelector('figure[data-metric="jonglieren"]')).toBeNull()
    expect(doc.body.textContent).toContain('2,14 s')
    expect(doc.body.textContent).toContain('150 cm')
    expect(doc.querySelector('form[aria-label="Messwert hinzufügen"]')).not.toBeNull()
  })

  it('Buchungen mit Titel, lokalem Datum/Uhrzeit und Zahlstatus', () => {
    const doc = html(screen())
    const section = doc.querySelector('section[aria-labelledby="bookings-heading"]')!
    expect(section.textContent).toContain('Technik 1:1')
    expect(section.textContent).toContain('29.03.2027, 18:00 Uhr')
    expect(section.textContent).toContain('Frühjahrscamp')
    expect(section.textContent).toContain('01.03.2027')
    expect(section.textContent).toContain('Zahlung offen')
    expect(section.textContent).toContain('Bezahlt')
  })

  it('leere Akte: Platzhalter statt Fehler', () => {
    const text = html(screen(record({ notes: [], goals: [], measurements: [], bookings: [] }))).body.textContent ?? ''
    expect(text).toContain('Noch keine Notizen.')
    expect(text).toContain('Noch keine Ziele.')
    expect(text).toContain('Noch keine Messwerte.')
    expect(text).toContain('Noch keine Buchungen.')
  })

  it('Schnellerfassung ist vorbelegt (Datum + Termin) und fokussiert bei ?neu=1&termin=', () => {
    const doc = html(screen(record(), { neu: '1', termin: 'c2' }))
    const form = doc.querySelector('form[aria-label="Neue Notiz"]')!
    expect(form.querySelector<HTMLInputElement>('input[type="date"]')!.getAttribute('value')).toBe('2027-03-01')
    expect(form.querySelector<HTMLOptionElement>('option[selected]')?.getAttribute('value')).toBe('c2')
    expect(form.querySelector('textarea[autofocus]')).not.toBeNull()
    const plain = html(screen())
    expect(plain.querySelector('textarea[autofocus]')).toBeNull()
    expect(plain.querySelector('form[aria-label="Neue Notiz"] input[type="date"]')!.getAttribute('value')).toBe(TODAY)
  })

  it('alle ids sind eindeutig, Labels zeigen auf genau ein Feld', () => {
    const doc = html(screen())
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const label of doc.querySelectorAll('label[for]')) expect(doc.querySelectorAll(`[id="${label.getAttribute('for')}"]`)).toHaveLength(1)
  })
})

describe('Doku schreiben in der Buchungszeile', () => {
  const offer: TrainingOffer = {
    id: 'offer-1', slug: 'einzel-45', title: 'Einzeltraining', kind: 'einzel', description: null, duration_minutes: 45, location: null,
    price_member_cents: 3000, price_nonmember_cents: 4050, status: 'published', created_at: '', updated_at: '',
  }
  const session: TrainingSessionAdmin = {
    id: 'sess-1', offer_id: 'offer-1', slug: 's1', status: 'published', starts_at: '2027-03-29T16:00:00Z', ends_at: '2027-03-29T16:45:00Z',
    local_date: '2027-03-29', local_time: '18:00', capacity: 1, booked_count: 1, free_spots: 0, price_member_cents: 3000, price_nonmember_cents: 4050, age_min: 4, age_max: 18, location: null,
  }
  const reg = (patch: Partial<RegistrationAdmin>): RegistrationAdmin => ({
    id: 'r1', registration_token: 'tok', payment_reference: 'CP-X', status: 'registered', payment_status: 'open', parent_first_name: 'E', parent_last_name: 'B',
    parent_email: 'e@example.test', parent_phone: '0', child_first_name: 'Kind', child_last_name: 'Beispiel', child_birth_date: '2016-05-01',
    emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null, jersey_size: null, pickup_authorized: null,
    photo_permission: false, created_at: '', applied_price_cents: 3000, member_match: true, payment_method: 'bar', ...patch,
  })
  const render = (registration: RegistrationAdmin) => html(
    <TrainingOfferScreen orgSlug="demo" org={org} offer={offer} sessions={[session]} registrationsBySession={{ 'sess-1': [registration] }} />,
  )

  it('verlinkt auf die Akte mit Termin und ?neu=1', () => {
    const link = [...render(reg({ player_id: 'player-9' })).querySelectorAll('a')].find(a => a.textContent === 'Doku schreiben')!
    expect(link.getAttribute('href')).toBe('/pilot/demo/spieler/player-9?neu=1&termin=sess-1')
  })

  it('blendet den Link ohne Spieler-Verknüpfung aus', () => {
    for (const patch of [{ player_id: null }, {}]) {
      expect([...render(reg(patch)).querySelectorAll('a')].some(a => a.textContent === 'Doku schreiben')).toBe(false)
    }
  })
})

describe('Schnellerfassung (interaktiv)', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(createNoteAction).mockReset()
    vi.mocked(deleteNoteAction).mockReset()
  })
  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const button = (name: string | RegExp) => [...container.querySelectorAll('button')].find(b => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')))!
  const form = () => container.querySelector<HTMLFormElement>('form[aria-label="Neue Notiz"]')!
  async function submit() {
    await act(async () => {
      form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 20))
    })
  }

  it('sendet Datum, Chips, Text, Bewertung und Termin an die Aktion und leert danach die Eingabe', async () => {
    vi.mocked(createNoteAction).mockResolvedValue({ error: null, saved: true })
    await act(() => root.render(screen(record(), { neu: '1', termin: 'c1' })))
    await act(async () => button('Technik').click())
    await act(async () => button('Mental').click())
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="4 von 5"]')!.click())
    await act(async () => setValue(container.querySelector<HTMLTextAreaElement>('textarea')!, 'Gute Ballannahme'))
    expect(button('Technik').getAttribute('aria-pressed')).toBe('true')
    await submit()
    expect(createNoteAction).toHaveBeenCalledTimes(1)
    const data = vi.mocked(createNoteAction).mock.calls[0][3] as FormData
    expect(data.get('note_date')).toBe('2027-03-29')
    expect(data.get('camp_id')).toBe('c1')
    expect(data.get('body')).toBe('Gute Ballannahme')
    expect(data.getAll('focus')).toEqual(['technik', 'mental'])
    expect(data.get('rating')).toBe('4')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Notiz gespeichert.')
    expect(container.querySelector<HTMLTextAreaElement>('form[aria-label="Neue Notiz"] textarea')!.value).toBe('')
    expect(button('Technik').getAttribute('aria-pressed')).toBe('false')
  })

  it('behält die Eingaben bei einem Fehler und meldet ihn als alert ohne Notizinhalt', async () => {
    vi.mocked(createNoteAction).mockResolvedValue({ error: 'Notiz konnte nicht gespeichert werden.' })
    await act(() => root.render(screen()))
    await act(async () => setValue(container.querySelector<HTMLTextAreaElement>('textarea')!, SECRET))
    await act(async () => button('Taktik').click())
    await submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Notiz konnte nicht gespeichert werden.')
    expect(container.querySelector<HTMLTextAreaElement>('form[aria-label="Neue Notiz"] textarea')!.value).toBe(SECRET)
    expect(button('Taktik').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(SECRET)
  })

  it('weist einen http-Link schon im Browser mit Hinweis ab', async () => {
    await act(() => root.render(screen()))
    const video = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => setValue(video, 'http://example.test/v'))
    expect(container.textContent).toContain('Bitte einen Link, der mit https:// beginnt.')
    await act(async () => setValue(video, 'https://example.test/v'))
    expect(container.textContent).not.toContain('Bitte einen Link, der mit https:// beginnt.')
  })

  it('Löschen fragt inline nach (kein Browser-Dialog) und ruft erst nach Bestätigung die Aktion auf', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteNoteAction).mockResolvedValue({ error: null, success: 'Notiz gelöscht.' })
    await act(() => root.render(screen()))
    await act(async () => button('Löschen').click())
    expect(container.textContent).toContain('Notiz endgültig löschen?')
    expect(deleteNoteAction).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    await act(async () => {
      container.querySelector<HTMLFormElement>('li[data-note-id="n2"] form')!.requestSubmit()
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(deleteNoteAction).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Notiz gelöscht.')
  })

  it('gibt bei fehlgeschlagenem Löschen einen alert aus', async () => {
    vi.mocked(deleteNoteAction).mockResolvedValue({ error: 'Notiz konnte nicht gelöscht werden.', success: null })
    await act(() => root.render(screen()))
    await act(async () => button('Löschen').click())
    await act(async () => {
      container.querySelector<HTMLFormElement>('li[data-note-id="n2"] form')!.requestSubmit()
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Notiz konnte nicht gelöscht werden.')
  })

  it('Spielersuche filtert im Browser und schreibt nichts in die URL', async () => {
    const before = window.location.href
    const players = [summary({}), summary({ id: 'p2', first_name: 'Jörg', last_name: 'Größe' })]
    await act(() => root.render(<PlayersScreen orgSlug="demo" org={org} players={players} />))
    await act(async () => setValue(container.querySelector<HTMLInputElement>('input[type="search"]')!, 'joerg'))
    expect(container.textContent).toContain('Jörg Größe')
    expect(container.textContent).not.toContain('Lena Mustermann')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('1 von 2 Spielern')
    expect(window.location.href).toBe(before)
  })
})
