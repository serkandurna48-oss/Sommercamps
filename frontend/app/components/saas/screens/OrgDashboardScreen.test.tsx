// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OrgDashboardScreen from './OrgDashboardScreen'
import { camps as fixtures, organization, registrations } from '../../../dev/admin-vorschau/fixtures'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { formatDateRange } from '../../../lib/i18n/de'
import { computeBrandTokens } from '../brandPipeline'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/dashboard' }))
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

function camp(slug: string, start_date = '2026-11-01', end_date = '2026-11-05', status: CampAdmin['status'] = 'published'): CampAdmin {
  return { ...fixtures[0], slug, title: slug, start_date, end_date, status, capacity: 100, location: 'Sportplatz Musterstadt' }
}

function render(camps: CampAdmin[], registrationsByCamp = camps.map(() => [] as RegistrationAdmin[])) {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = renderToStaticMarkup(<OrgDashboardScreen orgSlug="demo" org={{ ...organization, name: 'Testverein', slug: 'demo', logo_url: null, primary_color: null }} camps={camps} registrationsByCamp={registrationsByCamp} />)
  return doc.querySelector<HTMLElement>('section[aria-labelledby="dashboard-camps-title"]')!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('Ihre Camps auf dem Dashboard', () => {
  it('sortiert veröffentlichte Camps nach Start und klappt vergangene Camps ein; Enddatum heute bleibt aktuell', () => {
    const camps = [
      camp('später', '2026-12-01', '2026-12-05'),
      camp('vergangen-neuer', '2026-10-01', '2026-10-23'),
      camp('früher'),
      camp('läuft', '2026-10-20', '2026-10-24'),
      camp('vergangen-älter', '2025-01-01', '2025-01-05'),
    ]
    const original = camps.map(c => c.slug)
    const card = render(camps)
    expect(card.querySelector('h2')?.textContent).toBe('Ihre Camps')
    expect([...card.querySelectorAll(':scope > ul > li h3')].map(h => h.textContent)).toEqual(['läuft', 'früher', 'später'])
    const past = card.querySelector('details')!
    expect(past.open).toBe(false)
    expect(past.querySelector('summary')?.textContent).toBe('Vergangene Camps (2)')
    expect([...past.querySelectorAll('li h3')].map(h => h.textContent)).toEqual(['vergangen-älter', 'vergangen-neuer'])
    expect(camps.map(c => c.slug)).toEqual(original)
    expect(card.querySelectorAll('li')).toHaveLength(5)
  })

  it.each([
    [89, null], [90, 'fast voll'], [100, 'ausgebucht'],
  ] as const)('zeigt bei %i Prozent den richtigen Belegungsstatus', (count, status) => {
    const card = render([camp('belegung')], [Array.from({ length: count }, () => ({ ...registrations[0], status: 'confirmed' as const }))])
    expect(card.textContent).toContain(`${count} von 100 Plätzen belegt`)
    expect(card.style.getPropertyValue('--cp-brand')).toBe(computeBrandTokens(null).brand)
    if (status) expect(card.textContent).toContain(status)
    if (status !== 'fast voll') expect(card.textContent).not.toContain('fast voll')
    if (status !== 'ausgebucht') expect(card.textContent).not.toContain('ausgebucht')
    const bar = card.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe(String(count))
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-label')).toBe(`belegung: ${count} von 100 Plätzen belegt`)
    expect(bar.getAttribute('aria-valuetext')).toBe(`${count} von 100 Plätzen belegt`)
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${count}%`)
  })

  it('nutzt aktive Anmeldungen und zeigt die Warteliste separat; Stornos belegen keinen Platz', () => {
    const card = render([camp('zählung')], [[
      { ...registrations[0], status: 'registered' },
      { ...registrations[0], status: 'confirmed' },
      { ...registrations[0], status: 'waitlist' },
      { ...registrations[0], status: 'waitlist' },
      { ...registrations[0], status: 'cancelled' },
    ]])
    expect(card.textContent).toContain('2 von 100 Plätzen belegt')
    expect(card.textContent).toContain('2 auf der Warteliste')
  })

  it('zeigt bei leerer Warteliste keinen Wartelisteneintrag', () => {
    expect(render([camp('leer')]).textContent).not.toContain('Warteliste')
  })

  it('trennt Entwürfe unabhängig vom Datum und verlinkt die bestehende Konfiguration', () => {
    const card = render([camp('live'), camp('entwurf', '2020-01-01', '2020-01-05', 'draft')])
    const drafts = card.querySelector('section[aria-labelledby="dashboard-drafts-title"]')!
    expect(drafts.textContent).toContain('Entwürfe')
    expect(drafts.textContent).toContain('Entwurf – noch nicht sichtbar')
    const link = drafts.querySelector('a')!
    expect(link.textContent).toBe('Veröffentlichen')
    expect(link.getAttribute('href')).toBe('/pilot/demo/camps/entwurf/konfiguration')
    expect(drafts.querySelector('[role="progressbar"]')).toBeNull()
    expect(card.querySelector('details')).toBeNull()
    expect(card.querySelectorAll(':scope > ul > li')).toHaveLength(1)
  })

  it('zeigt Titel, Zeitraum und Ort sowie den Link zur Campseite', () => {
    const entry = camp('sommer')
    const card = render([entry])
    expect(card.textContent).toContain(formatDateRange(entry.start_date, entry.end_date))
    expect(card.textContent).toContain('Sportplatz Musterstadt')
    expect(card.querySelector('a[aria-label="Zum Camp: sommer"]')?.getAttribute('href')).toBe('/pilot/demo/camps/sommer')
  })

  it('zeigt einen ehrlichen Leerzustand und einen fehlenden Ort ohne erfundene Vereinsinhalte', () => {
    expect(render([]).textContent).toContain('Noch keine Camps angelegt.')
    expect(render([{ ...camp('ohne-ort'), location: null }]).textContent).toContain('Ort noch nicht hinterlegt')
  })

  it('behält geschlossene und archivierte Camps getrennt erreichbar', () => {
    const card = render([camp('geschlossen', undefined, undefined, 'closed'), camp('archiv', undefined, undefined, 'archived')])
    const details = card.querySelector('details')!
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('Geschlossene und archivierte Camps (2)')
    expect(details.querySelectorAll('li')).toHaveLength(2)
    expect(card.textContent).not.toContain('Vergangene Camps')
  })

  it('begrenzt überbuchte Balken, erhält aber den tatsächlichen Belegungstext', () => {
    const card = render([{ ...camp('voll'), capacity: 1 }], [[registrations[0], registrations[0]]])
    const bar = card.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.getAttribute('aria-valuetext')).toBe('2 von 1 Plätzen belegt')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
    expect(card.textContent).toContain('ausgebucht')
  })
})
