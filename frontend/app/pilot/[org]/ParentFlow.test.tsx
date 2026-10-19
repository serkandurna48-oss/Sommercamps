import { renderToStaticMarkup } from 'react-dom/server'
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
}

it.each(['tradition', 'akademie', 'kompakt'] as const)('%s uses the organization heading and intro', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[]} />)
  expect(html).toContain('Unser Fußballsommer')
  expect(html).toContain('Trainieren bei Demo FC.')
  expect(html).not.toContain('/jk/hero.jpg')
  if (theme !== 'kompakt') expect(html).toContain(org.hero_image_url)
})

it.each(['tradition', 'akademie', 'kompakt'] as const)('%s handles missing editorial content without another club image', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{
    ...org, theme, intro_heading: ' ', intro_text: null, hero_image_url: null,
  }} camps={[]} />)
  expect(html).toMatch(/<h1[^>]*>Demo FC<\/h1>/)
  expect(html).toContain('Alle Camps auf einen Blick')
  expect(html).not.toContain('/jk/')
  expect(html).not.toContain('/pilot/leibchen.webp')
})
