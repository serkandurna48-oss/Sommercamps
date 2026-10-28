import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import ParentFlow, { CampScreen } from './ParentFlow'
import RegistrationFormScreen from './RegistrationFormScreen'

// KSV-Tagesrunde 28.10.2026, mit Serkan abgestimmt. Andere Vereine bleiben unverändert.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'akademie', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
}
const ksv: OrganizationPublic = { ...org, slug: 'ksv-baunatal', name: 'KSV Baunatal' }

const camp = {
  slug: 'winter', title: 'Winter-Fußballschule 2027', start_date: '2027-01-04', end_date: '2027-01-07',
  registration_start: null, registration_end: null,
  age_min: 5, age_max: 12, capacity: 60, price_cents: 14900, currency: 'EUR',
  registration_open: true, location: 'Max-Riegel-Halle', care_info: null, meals_info: null, includes: null,
  registered_count: 1, waitlist_count: 0, spots_remaining: 59, is_full: false,
} as unknown as CampPublic
const teurer = { ...camp, slug: 'oster', price_cents: 19900 } as CampPublic

const themes = ['tradition', 'akademie', 'kompakt'] as const

it.each(themes)('KSV %s: kein Laufband, andere Vereine behalten es', theme => {
  expect(renderToStaticMarkup(<ParentFlow org={{ ...ksv, theme }} camps={[camp]} />)).not.toContain('marquee-band')
  expect(renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[camp]} />)).toContain('marquee-band')
})

it.each(themes)('KSV %s: Start zeigt Preis pro Camp statt Platzsumme', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...ksv, theme }} camps={[camp]} />)
  const hero = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  expect(hero).toContain('149 €')
  expect(hero).toContain('pro Camp')
  expect(hero).not.toContain('Plätze gesamt')
  const other = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[camp]} />)
  expect(other).toContain('Plätze gesamt')
})

it('KSV: bei unterschiedlichen Preisen steht "ab" vor dem kleinsten Preis', () => {
  const html = renderToStaticMarkup(<ParentFlow org={ksv} camps={[teurer, camp]} />)
  expect(html).toContain('ab 149 €')
})

it('KSV: "So einfach geht\'s" steht vor den Camps, bei anderen Vereinen danach', () => {
  const k = renderToStaticMarkup(<ParentFlow org={ksv} camps={[camp]} />)
  expect(k.indexOf('how-sec')).toBeGreaterThan(-1)
  expect(k.indexOf('how-sec')).toBeLessThan(k.indexOf('id="s-camps"'))
  expect(k.match(/class="pad how-sec/g)).toHaveLength(1)
  const o = renderToStaticMarkup(<ParentFlow org={org} camps={[camp]} />)
  expect(o.indexOf('how-sec')).toBeGreaterThan(o.indexOf('id="s-camps"'))
})

it('KSV-Campdetail: Kopf ohne Großbuchstaben-Zeile und ohne einzelne Tageszahl, Termin unter dem Titel', () => {
  const k = renderToStaticMarkup(<CampScreen org={ksv} camp={camp} onBack={vi.fn()} onRegister={vi.fn()} />)
  const head = k.slice(k.indexOf('camp-hd-in'), k.indexOf('camp-hd-meta'))
  expect(head).not.toContain('sec-label')
  expect(head).not.toContain('camp-date-block')
  const intro = head.slice(head.indexOf('camp-hd-intro')).replace(/<!-- -->/g, '')
  expect(intro).toMatch(/^camp-hd-intro">4\.[^<]*Jan\. 2027 · 5–12 Jahre</)
  expect(k).toContain('Max-Riegel-Halle')
  const o = renderToStaticMarkup(<CampScreen org={org} camp={camp} onBack={vi.fn()} onRegister={vi.fn()} />)
  expect(o).toContain('camp-date-block')
  expect(o).toContain('sec-label')
})

function form(orgSlug: string) {
  return renderToStaticMarkup(<RegistrationFormScreen orgSlug={orgSlug} orgName="Testverein" hasBankDetails
    camp={camp} onBack={vi.fn()} onSubmitted={vi.fn()} />)
}

it('KSV-Formular: Trikotgröße, Allergien und Abholung tragen "freiwillig", Pflichtfelder nicht', () => {
  const k = form('ksv-baunatal')
  expect(k.match(/class="opt-tag"> freiwillig/g)).toHaveLength(3)
  expect(k).toMatch(/Trikotgröße<span class="opt-tag">/)
  expect(k).toMatch(/Unverträglichkeiten<span class="opt-tag">/)
  expect(k).toMatch(/abholen\?<span class="opt-tag">/)
  expect(k).not.toMatch(/\*<span class="opt-tag">/)
  expect(k).not.toContain('Freiwillig. Diese Angaben')
  const o = form('testverein')
  expect(o).not.toContain('opt-tag')
  expect(o).toContain('Freiwillig. Diese Angaben')
})

it('KSV-CSS: ein Rotton für Kartenaktionen und Datumblock ausgeblendet, nur KSV-gescoped', () => {
  const css = readFileSync(new URL('./publicTheme.css', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('KSV Tagesrunde 28.10.'))
  expect(block).toMatch(/\[data-org='ksv-baunatal'\] \.camp:not\(\.full\) \.c-go \{[^}]*background: var\(--brand-strong\)/)
  expect(block).toMatch(/\[data-org='ksv-baunatal'\] \.camp \.c-date \{ display: none; \}/)
  for (const rule of block.split('}').filter(r => r.includes('{'))) {
    if (rule.trim().startsWith('@media')) continue
    expect(rule).toContain("[data-org='ksv-baunatal']")
  }
})
