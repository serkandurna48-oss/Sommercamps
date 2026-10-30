// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'
import { formatDateRange } from '../../../lib/i18n/de'
import ParticipantList from './ParticipantList'
import PaymentSection from './PaymentSection'
import WaitlistCard from './WaitlistCard'
import TodayRegistrations from './TodayRegistrations'
import StatusChip from './StatusChip'
import RowOverflow from '../ui/RowOverflow'
import ActionForm from '../ui/ActionForm'
import { setPaymentStatusAction } from '../actions/paymentActions'
import { buildPaymentReminder, buildOpenPaymentList } from '../../../lib/zahlungserinnerung'

vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))
vi.mock('../actions/waitlistActions', () => ({ resendRegistrationMailAction: vi.fn(), cancelRegistrationAction: vi.fn(), promoteWaitlistAction: vi.fn(), updateRegistrationDetailsAction: vi.fn() }))

const fixture = getPreviewFixtures(false, new Date('2026-10-24T12:00:00Z'))
const camp = fixture.camps[0]
const registration = { ...fixture.registrationsByCamp[0][1], payment_status: 'open' as const }
const dateLine = `${camp.title} · ${formatDateRange(camp.start_date, camp.end_date)}`
const reminderOrg = { ...fixture.org, iban: 'DE89370400440532013000' }
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it.each(['Bezahlt', 'Offen', 'Storniert', 'Warteliste', 'Kostenlos'])('status text remains visible, including the dot variant: %s', label => {
  for (const dot of [false, true]) {
    host.innerHTML = renderToStaticMarkup(<StatusChip tone="pending" label={label} dot={dot} />)
    expect(host.querySelector('.cp-chip')?.textContent).toBe(label)
    expect(host.querySelector('.cp-chip')?.getAttribute('aria-hidden')).toBeNull()
  }
})

it('renders camp, date, name and text status in every list without another data request', async () => {
  await act(() => root.render(<>
    <ParticipantList camp={camp} campSlug={camp.slug} registrations={[registration]} orgSlug="demo" brandColor="#116644" />
    <PaymentSection org={fixture.org} entries={[{ camp, registration }]} orgSlug="demo" brandColor="#116644" emptyLabel="Leer" csvFilename="test.csv" xlsxHref="/export" />
    <WaitlistCard orgSlug="demo" campSlug={camp.slug} campTitle={camp.title} campDate={formatDateRange(camp.start_date, camp.end_date)}
      capacity={20} registeredCount={20} priceCents={camp.price_cents} currency={camp.currency} waitlisted={[{ ...registration, status: 'waitlist' }]}
      brandColor="#116644" brandStrong="#116644" brandOn="#fff" />
    <TodayRegistrations entries={[{ camp, registration }]} orgSlug="demo" fullList />
  </>))
  const rows = [...host.querySelectorAll('.cp-mobile-card')]
  expect(rows).toHaveLength(4)
  for (const row of rows) {
    expect(row.textContent).toContain(`${registration.child_first_name} ${registration.child_last_name}`)
    expect(row.querySelector('.cp-camp-date')?.textContent).toBe(dateLine)
    expect(row.querySelector('.cp-row-status, .cp-today-card')?.textContent).toMatch(/offen|Warteliste/i)
    expect(row.querySelector('[aria-haspopup="dialog"]')).not.toBeNull()
  }
  expect(host.querySelectorAll('.cp-mobile-filters input[type="search"]')).toHaveLength(2)
})

it('opens the overflow from the keyboard, focuses its first action and returns focus on Escape', async () => {
  await act(() => root.render(<RowOverflow label="Weitere Aktionen für Mia"><button>Eltern kontaktieren</button><a href="tel:123">Eltern anrufen</a></RowOverflow>))
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup]')!
  trigger.focus()
  // Native button activation is supplied by the browser; click is its React event.
  await act(() => trigger.click())
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  const dialog = host.querySelector('[role="dialog"]')!
  expect(dialog.getAttribute('aria-label')).toBe('Weitere Aktionen für Mia')
  expect(document.activeElement).toBe(dialog.querySelector('button'))
  await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
})

it('keeps the reminder in the payment overflow and the payment action outside it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const entry = { camp, registration }
  await act(() => root.render(<PaymentSection org={reminderOrg} entries={[entry]} orgSlug="demo" brandColor="#116644"
    emptyLabel="Leer" csvFilename="test.csv" xlsxHref="/export" />))
  const row = host.querySelector('.cp-ledger-row')!
  const buttons = [...row.querySelectorAll('button')]
  const primary = buttons.find(button => button.textContent === 'Als bezahlt markieren')!
  expect(primary.closest('.cp-overflow-panel')).toBeNull()
  expect(primary.className).toContain('cp-btn-primary')
  await act(() => row.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
  const dialog = row.querySelector('[role="dialog"]')!
  const reminder = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Erinnerung kopieren')!
  expect(reminder).toBeDefined()
  await act(async () => reminder.click())
  expect(writeText).toHaveBeenLastCalledWith(buildPaymentReminder(entry, reminderOrg))
  expect(dialog.textContent).toContain('Text kopiert')
  expect(setPaymentStatusAction).not.toHaveBeenCalled()
  writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
  await act(async () => reminder.click())
  const fallback = row.querySelector('textarea')!
  expect(fallback.readOnly).toBe(true)
  expect(fallback.value).toBe(buildPaymentReminder(entry, reminderOrg))
  expect(fallback.closest('.cp-overflow-panel')).toBeNull()
  await act(() => fallback.focus())
  expect(fallback.selectionEnd).toBe(fallback.value.length)
  expect(row.querySelector('[aria-haspopup]')?.getAttribute('aria-expanded')).toBe('false')
  const bulk = [...host.querySelectorAll('button')].find(button => button.textContent === 'Alle offenen als Liste kopieren')!
  await act(async () => bulk.click())
  expect(writeText).toHaveBeenLastCalledWith(buildOpenPaymentList([entry]))
})

it('preserves parent e-mail copy and the BCC hint alongside the mobile participant menu', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await act(() => root.render(<ParticipantList camp={camp} campSlug={camp.slug} registrations={[registration]}
    orgSlug="demo" brandColor="#116644" />))
  await act(() => host.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
  const select = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find(button => button.textContent === 'Für Sammelaktion auswählen')!
  await act(() => select.click())
  expect(select.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('a[href^="mailto:?bcc="]')?.getAttribute('href')).toContain(registration.parent_email)
  const copy = [...host.querySelectorAll('button')].find(button => button.textContent === 'E-Mail-Adressen kopieren')!
  await act(async () => copy.click())
  expect(writeText).toHaveBeenCalledExactlyOnceWith(registration.parent_email.toLocaleLowerCase('de').trim())
  expect(host.textContent).toContain('fügen Sie sie in Ihrem E-Mail-Programm in das BCC-Feld ein.')
})

it('keeps confirmation and its result inside the overflow, and closes when focus leaves', async () => {
  const action = vi.fn(async () => ({ error: null, success: 'Gespeichert' }))
  await act(() => root.render(<><RowOverflow label="Zahlungsaktionen"><ActionForm action={action}
    label="Erlassen" pendingLabel="Speichern" requireConfirm="Wirklich erlassen?" /></RowOverflow><button id="outside">Weiter</button></>))
  await act(() => host.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
  await act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click())
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Wirklich erlassen?')
  expect(action).not.toHaveBeenCalled()
  await act(async () => { host.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!.click() })
  expect(action).toHaveBeenCalledOnce()
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Gespeichert')
  await act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.focus())
  await act(() => host.querySelector<HTMLButtonElement>('#outside')!.focus())
  expect(host.querySelector('[aria-haspopup]')?.getAttribute('aria-expanded')).toBe('false')
})
