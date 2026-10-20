/**
 * M1 Motion — Anforderungsnachweis:
 *   1. Inhalte im Server-Rendering vollständig sichtbar (kein opacity:0 ohne JS-Klasse)
 *   2. prefers-reduced-motion-Regel vorhanden
 */
import { readFileSync } from 'fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'
import ParentFlow from './ParentFlow'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: 'https://images.example.com/demo.jpg',
  trainer_image_url: null, trainer_text: null, terms_text: null,
}

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  '%s: org-Screen ist im SSR vollständig sichtbar — kein opacity:0 als Inline-Style',
  (theme) => {
    const html = renderToStaticMarkup(createElement(ParentFlow, { org: { ...org, theme }, camps: [] }))
    // Kein inline-style opacity:0 — JS-Klassen wie m1-ready werden im SSR nie gesetzt.
    // Negative lookahead schließt opacity:0.55 (z. B. Deko-Icons) aus.
    expect(html).not.toMatch(/style="[^"]*opacity\s*:\s*0(?![\d.])/)
    // Pflichtinhalte sichtbar
    expect(html).toContain('Unser Fußballsommer')
    expect(html).toContain('Trainieren bei Demo FC.')
  },
)

it('publicTheme.css enthält eine prefers-reduced-motion-Regel', () => {
  const css = readFileSync(new URL('./publicTheme.css', import.meta.url), 'utf-8')
  expect(css).toContain('prefers-reduced-motion: reduce')
})
