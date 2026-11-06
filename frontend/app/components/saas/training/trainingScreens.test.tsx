// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { organization } from '../../../dev/admin-vorschau/fixtures'
import type { ClubMember, RegistrationAdmin, TrainingOffer, TrainingSessionAdmin } from '../../../lib/saasAdminApi'
import MembersScreen from '../screens/MembersScreen'
import TrainingOfferScreen from '../screens/TrainingOfferScreen'
import TrainingsScreen from '../screens/TrainingsScreen'
import MemberImport from './MemberImport'
import ShareActions from './ShareActions'
import { importMembersAction, removeMemberExtraFieldAction, updateOfferAction } from '../actions/trainingActions'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/trainings' }))
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))
vi.mock('../actions/trainingActions', () => ({
  createOfferAction: vi.fn(), updateOfferAction: vi.fn(), createSessionAction: vi.fn(), deleteSessionAction: vi.fn(),
  cancelSessionAction: vi.fn(), createMemberAction: vi.fn(), setMemberActiveAction: vi.fn(), importMembersAction: vi.fn(),
  removeMemberExtraFieldAction: vi.fn(),
}))
vi.mock('../actions/waitlistActions', () => ({ cancelRegistrationAction: vi.fn(), deleteRegistrationAction: vi.fn() }))
vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

const org = { ...organization, name: 'Testverein', slug: 'demo', logo_url: null, primary_color: null }

const offer: TrainingOffer = {
  id: 'offer-1', slug: 'einzel-45', title: 'Einzeltraining Technik', kind: 'einzel', description: null, duration_minutes: 45,
  location: 'Sportplatz', price_member_cents: 3000, price_nonmember_cents: 4050, status: 'published',
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
}
const session: TrainingSessionAdmin = {
  id: 'sess-1', offer_id: 'offer-1', slug: 'einzel-45-2026-03-29-1800', status: 'published',
  // 16:00Z is 18:00 in Berlin (DST); the screen must show local_time, not recompute.
  starts_at: '2026-03-29T16:00:00Z', ends_at: '2026-03-29T16:45:00Z', local_date: '2026-03-29', local_time: '18:00',
  capacity: 1, booked_count: 1, free_spots: 0, price_member_cents: 3000, price_nonmember_cents: 4050, age_min: 4, age_max: 18, location: 'Sportplatz',
}
const registration = (patch: Partial<RegistrationAdmin>): RegistrationAdmin => ({
  id: 'r1', registration_token: 'tok-r1', payment_reference: 'CP-X', status: 'registered', payment_status: 'open',
  parent_first_name: 'Erika', parent_last_name: 'Beispiel', parent_email: 'erika@example.test', parent_phone: '0123',
  child_first_name: 'Kind', child_last_name: 'Beispiel', child_birth_date: '2016-05-01',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null, jersey_size: null,
  pickup_authorized: null, photo_permission: false, created_at: '2026-03-01T10:00:00Z',
  applied_price_cents: 3000, member_match: true, payment_method: 'bar', ...patch,
})

function html(node: React.ReactElement): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = renderToStaticMarkup(node)
  return doc
}

describe('Trainingsangebote', () => {
  it('listet Angebote mit Preisen in Euro, Zahlen im de-DE-Format und Link zum Detail', () => {
    const doc = html(<TrainingsScreen orgSlug="demo" org={org} offers={[offer]} />)
    expect(doc.querySelector('h1')?.textContent).toBe('Trainings')
    const text = doc.body.textContent ?? ''
    expect(text).toContain('Einzeltraining Technik')
    expect(text).toContain('Mitglieder 30,00')
    expect(text).toContain('Nichtmitglieder 40,50')
    expect(doc.querySelector('a[href="/pilot/demo/trainings/offer-1"]')).not.toBeNull()
    expect(doc.querySelector('a[href="/pilot/demo/trainings/new"]')?.textContent).toBe('Angebot anlegen')
  })

  it('ohne Mitglieder-Modul nur ein Preis in der Angebotsliste', () => {
    const text = html(<TrainingsScreen orgSlug="demo" org={{ ...org, modules: ['camps', 'trainings'] }} offers={[offer]} />).body.textContent ?? ''
    expect(text).not.toContain('Mitglieder')
    expect(text).toContain('40,50')
  })

  // Launch-UX: Trainings/Mitglieder are reached through the sidebar in the layout (AdminSidebar.test.tsx).
  it('zeigt die Primäraktion im Seitenkopf und einen Leerzustand', () => {
    const doc = html(<TrainingsScreen orgSlug="demo" org={org} offers={[]} />)
    expect(doc.querySelector('header.cp-page-head a[href="/pilot/demo/trainings/new"]')?.className).toContain('cp-btn-primary')
    expect(doc.querySelector('header a.cp-back-link')).toBeNull()
    expect(doc.body.textContent).toContain('Noch kein Trainingsangebot.')
  })

  it('bietet Teilen nur für veröffentlichte Angebote an', () => {
    const draft = html(<TrainingsScreen orgSlug="demo" org={org} offers={[{ ...offer, status: 'draft' }]} />)
    expect(draft.body.textContent).toContain('sobald das Angebot veröffentlicht ist')
    expect(draft.body.textContent).not.toContain('Link kopieren')
    const live = html(<TrainingsScreen orgSlug="demo" org={org} offers={[offer]} />)
    expect(live.body.textContent).toContain('Link kopieren')
  })
})

describe('Angebot mit Terminen und Buchungen', () => {
  const render = (registrations: RegistrationAdmin[], s = session) => html(
    <TrainingOfferScreen orgSlug="demo" org={org} offer={offer} sessions={[s]} registrationsBySession={{ [s.id]: registrations }} />,
  )

  it('zeigt die Berliner Ortszeit aus local_date/local_time, nicht die UTC-Zeit', () => {
    const text = render([registration({})]).body.textContent ?? ''
    expect(text).toContain('29.03.2026, 18:00 Uhr')
    expect(text).not.toContain('16:00')
  })

  it('zeigt Zahlart, angewandten Preis, Mitgliedsstatus und Zahlstatus je Buchung', () => {
    const doc = render([registration({})])
    const row = doc.querySelector('li[data-payment-status="open"]')!
    expect(row.textContent).toContain('Kind Beispiel')
    expect(row.textContent).toContain('30,00')
    expect(row.textContent).toContain('Mitglied')
    expect(row.textContent).toContain('Zahlart: Bar')
    expect(row.textContent).toContain('Zahlung offen')
    expect(row.textContent).toContain('Barzahlung vor Ort')
    expect(row.textContent).toContain('Als bezahlt markieren')
  })

  it('ohne Mitglieder-Modul kein Mitglied-/Nichtmitglied-Label', () => {
    const doc = html(<TrainingOfferScreen orgSlug="demo" org={{ ...org, modules: ['camps', 'trainings'] }} offer={offer}
      sessions={[session]} registrationsBySession={{ [session.id]: [registration({ member_match: false })] }} />)
    const row = doc.querySelector('li[data-payment-status="open"]')!
    expect(row.textContent).not.toContain('Mitglied')
  })

  it('Nichtmitglied, Preis 0 und Überweisung', () => {
    const doc = render([registration({ member_match: false, applied_price_cents: 0, payment_method: 'ueberweisung', payment_status: 'paid' })])
    const row = doc.querySelector('li[data-payment-status="paid"]')!
    expect(row.textContent).toContain('Nichtmitglied')
    expect(row.textContent).toContain('0,00')
    expect(row.textContent).toContain('Zahlart: Überweisung')
    expect(row.textContent).not.toContain('Als bezahlt markieren')
    expect(row.textContent).toContain('Wieder auf Offen setzen')
  })

  it('alle id-Attribute der Angebotsseite sind eindeutig und Labels zeigen auf genau ein Feld', () => {
    const doc = render([registration({})])
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const label of doc.querySelectorAll('label[for]')) {
      expect(doc.querySelectorAll(`[id="${label.getAttribute('for')}"]`)).toHaveLength(1)
    }
  })

  it('Einzel-Termin hat kein Kapazitätsfeld, Gruppentermin schon (1 bis 8)', () => {
    expect(render([]).querySelector('input[name="capacity"]')).toBeNull()
    const group = html(<TrainingOfferScreen orgSlug="demo" org={org} offer={{ ...offer, kind: 'gruppe' }} sessions={[]} registrationsBySession={{}} />)
    const capacity = group.querySelector<HTMLInputElement>('input[name="capacity"]')!
    expect(capacity.min).toBe('1')
    expect(capacity.max).toBe('8')
  })

  it('Terminformular bietet Wiederholung in Wochen (Standard 1, 1 bis 12)', () => {
    const weeks = render([]).querySelector<HTMLInputElement>('input[name="weeks"]')!
    expect(weeks.value).toBe('1')
    expect(weeks.min).toBe('1')
    expect(weeks.max).toBe('12')
    expect(render([]).body.textContent).toContain('Wöchentlich wiederholen')
  })

  it('Termin mit aktiver Buchung kann nicht gelöscht oder abgesagt werden, ein leerer schon', () => {
    const booked = render([registration({})]).body.textContent ?? ''
    expect(booked).not.toContain('Termin löschen')
    expect(booked).not.toContain('Termin absagen')
    expect(booked).toContain('Zum Absagen zuerst die Buchungen stornieren')
    const empty = render([], { ...session, booked_count: 0, free_spots: 1 }).body.textContent ?? ''
    expect(empty).toContain('Termin löschen')
    expect(empty).toContain('Termin absagen')
  })

  it('Bearbeiten zeigt Web-Adresse und Art nur an und füllt Preise im Komma-Format', () => {
    const doc = render([])
    expect(doc.querySelector('form input[name="slug"]')).toBeNull()
    expect(doc.querySelector<HTMLInputElement>('input[name="price_member_euros"]')!.defaultValue).toBe('30,00')
    expect(doc.querySelector<HTMLInputElement>('input[name="price_nonmember_euros"]')!.defaultValue).toBe('40,50')
    expect(doc.body.textContent).toContain('einzel-45')
  })
})

const member: ClubMember = {
  id: 'm1', first_name: 'Max', last_name: 'Mustermann', birth_date: '2015-02-01', member_number: 'M-1', active: true, source: 'csv', created_at: '2026-11-01T10:00:00Z',
}

describe('Mitglieder', () => {
  it('zeigt Liste, Suche, Import und Einzeleintrag', () => {
    const doc = html(<MembersScreen orgSlug="demo" org={org} members={[member, { ...member, id: 'm2', first_name: 'Erika', active: false, source: 'manual', member_number: null }]} />)
    const text = doc.body.textContent ?? ''
    expect(text).toContain('Max Mustermann')
    expect(text).toContain('geboren 01.02.2015')
    expect(text).toContain('Nr. M-1')
    expect(text).toContain('Auf inaktiv setzen')
    expect(text).toContain('Auf aktiv setzen')
    expect(doc.querySelector('[role="search"] input[type="search"]')).not.toBeNull()
    expect(doc.querySelector('form[method="get"]')).toBeNull()
    expect(doc.querySelector('input[type="file"]')).not.toBeNull()
    expect(text).toContain('Vorlage herunterladen')
    expect(doc.querySelector('input[name="first_name"]')).not.toBeNull()
  })

  it('leerer Zustand', () => {
    expect(html(<MembersScreen orgSlug="demo" org={org} members={[]} />).body.textContent).toContain('Noch keine Mitglieder.')
  })
})

describe('interaktive Teile', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(importMembersAction).mockReset()
  })
  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('Mitgliedersuche filtert im Browser und schreibt nichts in die URL', async () => {
    const before = window.location.href
    const members = [member, { ...member, id: 'm2', first_name: 'Erika', last_name: 'Groß', member_number: null, active: false }]
    await act(() => root.render(<MembersScreen orgSlug="demo" org={org} members={members} />))
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'gross')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('Erika')
    expect(container.textContent).not.toContain('Max Mustermann')
    expect(container.textContent).toContain('1 von 2 Mitgliedern')
    expect(window.location.href).toBe(before)
    expect(container.querySelector('form[method="get"]')).toBeNull()
  })

  it('Gespeichert-Meldung bleibt sichtbar, auch wenn sich updated_at nach dem Speichern ändert', async () => {
    vi.mocked(updateOfferAction).mockResolvedValue({ error: null, saved: true })
    const screen = (o: TrainingOffer) => <TrainingOfferScreen orgSlug="demo" org={org} offer={o} sessions={[]} registrationsBySession={{}} />
    await act(() => root.render(screen(offer)))
    const form = container.querySelector<HTMLFormElement>('form:has(input[name="duration_minutes"]):not(:has(input[name="date"]))')!
    await act(async () => { form.requestSubmit() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(container.textContent).toContain('Gespeichert.')
    // revalidatePath delivers the new updated_at: the form must not remount.
    await act(() => root.render(screen({ ...offer, updated_at: '2026-11-02T10:00:00Z' })))
    expect(container.textContent).toContain('Gespeichert.')
  })

  it('Link kopieren schreibt die öffentliche URL, WhatsApp verlinkt Titel – URL', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await act(() => root.render(<ShareActions orgSlug="demo" offerSlug="einzel-45" title="Einzeltraining & Technik" published />))
    const url = `${window.location.origin}/pilot/demo/training/einzel-45`
    const buttons = [...container.querySelectorAll('button')]
    await act(async () => buttons.find(b => b.textContent === 'Link kopieren')!.click())
    expect(writeText).toHaveBeenCalledWith(url)
    expect(container.textContent).toContain('Link in der Zwischenablage')
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!
    expect(whatsapp.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(`Einzeltraining & Technik – ${url}`)}`)
    expect(whatsapp.rel).toContain('noopener')
  })

  it('zeigt bei verweigerter Zwischenablage die URL zum manuellen Kopieren', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) } })
    await act(() => root.render(<ShareActions orgSlug="demo" offerSlug="einzel-45" title="T" published />))
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Link kopieren')!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('/pilot/demo/training/einzel-45')
  })

  async function pickFile(content: BlobPart[], name = 'm.csv') {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(content, name, { type: 'text/csv' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  async function submitImport() {
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(resolve => setTimeout(resolve, 50))
    })
  }

  it('Import dekodiert Excel-CSV (windows-1252), sendet die Zuordnung und zeigt die Zähler', async () => {
    vi.mocked(importMembersAction).mockResolvedValue({ error: null, errors: [], result: { rows: 2, created: 1, updated: 1, merged_in_file: 0 } })
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    // "Müller" with a CP1252 u-umlaut (0xFC) is not valid UTF-8.
    const head = new TextEncoder().encode('vorname;nachname;geburtsdatum\nAnna;')
    await pickFile([head, new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]), ';01.02.2015'])
    await submitImport()
    expect(importMembersAction).toHaveBeenCalledWith('demo', 'vorname;nachname;geburtsdatum\nAnna;Müller;01.02.2015',
      { 0: 'first_name', 1: 'last_name', 2: 'birth_date' })
    expect(container.textContent).toContain('2 Zeilen gelesen, 1 neu, 1 aktualisiert')
  })

  const CLUB_EXPORT = [
    'Mitgl.-Nr.;Name;Vorname;Geb.-Datum;Mannschaft;Telefon;Allergien',
    ...Array.from({ length: 7 }, (_, i) => `M-${i};Muster${i};Kind${i};0${i + 1}.02.2015;U10;0123;Nuss`),
  ].join('\n')

  function select(column: number) {
    return container.querySelector<HTMLSelectElement>(`select[data-column="${column}"]`)!
  }
  async function setValue(element: HTMLSelectElement | HTMLInputElement, value: string) {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
  }
  async function waitForPreview() {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }

  it('Zuordnung: senkrechte Liste mit Beispielwerten, Alias-Vorschlägen, Datenschutzhinweis, Warnung und Übersicht', async () => {
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await pickFile([CLUB_EXPORT])
    await waitForPreview()
    expect(container.querySelector('[data-testid="privacy-hint"]')?.textContent)
      .toBe('Nur Felder übernehmen, die du für Training und Preis brauchen. Keine Gesundheitsdaten, Adressen oder Telefonnummern.')
    // One row per CSV column, no preview table that needs horizontal scrolling.
    expect(container.querySelectorAll('[data-mapping-row]')).toHaveLength(7)
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('[data-samples="2"]')?.textContent).toBe('z. B. Kind0 · Kind1 · Kind2')
    expect(container.textContent).toContain('7 Zeilen, 7 Spalten')
    expect([0, 1, 2, 3, 4, 5, 6].map(i => select(i).value))
      .toEqual(['member_number', 'last_name', 'first_name', 'birth_date', 'skip', 'skip', 'skip'])
    expect([...container.querySelectorAll('[data-sensitive]')].map(el => el.getAttribute('data-sensitive'))).toEqual(['5', '6'])
    expect([...select(0).options].map(o => o.textContent)).toEqual(['Vorname', 'Nachname', 'Geburtsdatum', 'Mitgliedsnummer', 'Zusatzfeld', 'Nicht importieren'])
    expect(container.querySelector('[data-testid="mapping-summary"]')?.textContent).toContain(
      'Vorname ← Vorname, Nachname ← Name, Geburtsdatum ← Geb.-Datum, Mitgliedsnummer ← Mitgl.-Nr. · 3 ignoriert')
    expect(container.querySelector('[data-testid="mapping-missing"]')).toBeNull()
    // Missing required field and an imported sensitive column are visible right away.
    await setValue(select(3), 'skip')
    await setValue(select(5), 'extra')
    const summary = container.querySelector('[data-testid="mapping-summary"]')!.textContent
    expect(summary).toContain('Fehlt noch: Geburtsdatum')
    expect(summary).toContain('1 Zusatzfeld · 3 ignoriert')
    expect(summary).toContain('1 möglicherweise sensible Spalte wird importiert.')
  })

  it('Zuordnung: Zusatzfeld mit eigener Bezeichnung wird gesendet, sensible Spalte nicht', async () => {
    vi.mocked(importMembersAction).mockResolvedValue({ error: null, errors: [], result: { rows: 7, created: 7, updated: 0, merged_in_file: 0 } })
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await pickFile([CLUB_EXPORT])
    await waitForPreview()
    await setValue(select(4), 'extra')
    const label = container.querySelector<HTMLInputElement>('input[data-label-for="4"]')!
    expect(label.value).toBe('Mannschaft')
    await setValue(label, 'Team')
    await submitImport()
    expect(importMembersAction).toHaveBeenCalledWith('demo', CLUB_EXPORT, {
      0: 'member_number', 1: 'last_name', 2: 'first_name', 3: 'birth_date', 4: { extra: 'Team' }, 5: null, 6: null,
    })
  })

  it('Zuordnung: fehlendes Pflichtfeld oder doppelte Zuordnung sendet nichts', async () => {
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await pickFile([CLUB_EXPORT])
    await waitForPreview()
    await setValue(select(3), 'skip')
    await submitImport()
    expect(importMembersAction).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="mapping-errors"]')?.textContent).toContain('Bitte eine Spalte als Geburtsdatum zuordnen.')
    await setValue(select(3), 'first_name')
    await submitImport()
    expect(importMembersAction).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="mapping-errors"]')?.textContent).toContain('Vorname ist mehreren Spalten zugeordnet')
  })

  it('Mitgliederliste zeigt Zusatzfelder als Spalten (alphabetisch) und sucht darin', async () => {
    const members: ClubMember[] = [
      { ...member, extra: { Mannschaft: 'U10', Beitrag: 'Familie' } },
      { ...member, id: 'm2', first_name: 'Erika', last_name: 'Beispiel', member_number: null, extra: { Mannschaft: 'U12' } },
    ]
    await act(() => root.render(<MembersScreen orgSlug="demo" org={org} members={members} />))
    const head = container.querySelector('.cp-table-head')!
    expect([...head.querySelectorAll('[data-extra-head]')].map(el => el.getAttribute('data-extra-head'))).toEqual(['Beitrag', 'Mannschaft'])
    expect(container.querySelector('.cp-member-scroll')).not.toBeNull()
    const rows = container.querySelectorAll('li.cp-table-row')
    const empty = rows[1].querySelector('[data-extra="Beitrag"]')!
    expect(empty.textContent).toBe('Beitrag: –')
    expect(empty.className).toContain('max-lg:hidden')  // phones: no empty extra lines
    expect(rows[0].querySelector('[data-extra="Mannschaft"]')?.textContent).toBe('Mannschaft: U10')
    expect(rows[0].querySelector('[data-extra="Mannschaft"]')?.className).not.toContain('max-lg:hidden')
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await setValue(search, 'u12')
    expect(container.textContent).toContain('Erika')
    expect(container.textContent).not.toContain('Max Mustermann')
  })

  it('Zusatzfeld "constructor" liest nicht den Prototyp', async () => {
    const members: ClubMember[] = [{ ...member, extra: { Team: 'A' } }, { ...member, id: 'm2', first_name: 'Eva', extra: { constructor: 'x' } }]
    await act(() => root.render(<MembersScreen orgSlug="demo" org={org} members={members} />))
    const rows = container.querySelectorAll('li.cp-table-row')
    expect(rows[0].querySelector('[data-extra="constructor"]')?.textContent).toBe('constructor: –')
    expect(rows[1].querySelector('[data-extra="constructor"]')?.textContent).toBe('constructor: x')
  })

  it('Zusatzfeld entfernen: erst bestätigen, dann Aktion mit dem Label', async () => {
    vi.mocked(removeMemberExtraFieldAction).mockReset().mockResolvedValue({ error: null, members: 1 })
    const members: ClubMember[] = [{ ...member, extra: { Telefon: '0123', Team: 'U10' } }]
    await act(() => root.render(<MembersScreen orgSlug="demo" org={org} members={members} />))
    const head = container.querySelector('.cp-table-head')!
    await act(async () => head.querySelector<HTMLButtonElement>('[data-remove-extra="Telefon"]')!.click())
    expect(removeMemberExtraFieldAction).not.toHaveBeenCalled()
    expect(head.textContent).toContain('Bei allen Mitgliedern löschen?')
    await act(async () => { head.querySelector<HTMLButtonElement>('[data-confirm-remove="Telefon"]')!.click() })
    expect(removeMemberExtraFieldAction).toHaveBeenCalledWith('demo', 'Telefon')
    // Phones get the same controls outside the (hidden) table head.
    expect(container.querySelector('[data-extra-fields-mobile] [data-remove-extra="Team"]')).not.toBeNull()
  })

  it('Scrollbox der breiten Mitgliederliste ist positioniert (sr-only-Präfixe bleiben drin, keine Seitenbreite)', () => {
    const css = readFileSync(join(process.cwd(), 'app/components/saas/tokens.css'), 'utf8')
    const rule = css.match(/\.cp-member-scroll\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/position:\s*relative/)
  })

  it('Mitgliederliste ohne Zusatzfelder bleibt beim kompakten Layout', async () => {
    await act(() => root.render(<MembersScreen orgSlug="demo" org={org} members={[member]} />))
    expect(container.querySelector('.cp-member-scroll')).toBeNull()
    expect(container.querySelectorAll('.cp-table-head span')).toHaveLength(5)
  })

  it('Importfehler erscheinen als "Zeile X: Feld Y (code)" ohne Inhalte', async () => {
    vi.mocked(importMembersAction).mockResolvedValue({
      error: 'Import abgelehnt – es wurde nichts gespeichert.',
      errors: [{ row: 3, field: 'geburtsdatum', code: 'invalid_date' }, { row: 7, field: 'nachname', code: 'required' }],
      result: null,
    })
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await pickFile(['vorname;nachname;geburtsdatum\nGeheimname;Kind;kaputt\n'])
    await submitImport()
    const alert = container.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Zeile 3: Feld geburtsdatum (invalid_date)')
    expect(alert.textContent).toContain('Zeile 7: Feld nachname (required)')
    expect(alert.textContent).not.toContain('Geheimname')
  })

  it('ohne Datei wird nichts gesendet', async () => {
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await submitImport()
    expect(importMembersAction).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('CSV-Datei auswählen')
  })

  it('Vorlage wird lokal als Blob geladen, ohne Server-Aufruf', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await act(() => root.render(<MemberImport orgSlug="demo" />))
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Vorlage herunterladen')!.click())
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((createObjectURL.mock.calls[0] as unknown as [Blob])[0].type).toContain('text/csv')
    expect(click).toHaveBeenCalled()
    expect(importMembersAction).not.toHaveBeenCalled()
    click.mockRestore()
  })
})
