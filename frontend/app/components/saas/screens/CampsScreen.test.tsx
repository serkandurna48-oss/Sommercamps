import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CampsScreen from './CampsScreen'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'
import { PLAN_CAMP_LIMIT_MESSAGE } from '../../../lib/saasAdminApi'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/camps' }))

const fixtures = getPreviewFixtures()
const render = (usage: Record<string, unknown>) =>
  renderToStaticMarkup(<CampsScreen orgSlug={fixtures.orgSlug} org={{ ...fixtures.org, ...usage }} camps={[]} registrationsByCamp={[]} />)

it('sperrt "Camp anlegen" im Starter mit einem aktiven Camp und zeigt die Meldung', () => {
  const html = render({ plan: 'starter', active_camps: 1 })
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Camp anlegen<\/button>/)
  expect(html).not.toContain('/camps/new')
  expect(html).toContain(PLAN_CAMP_LIMIT_MESSAGE)
})

it.each([
  ['starter ohne aktives Camp', { plan: 'starter', active_camps: 0 }],
  ['verein', { plan: 'verein', active_camps: 4 }],
])('lässt "Camp anlegen" offen: %s', (_n, usage) => {
  const html = render(usage)
  expect(html).toContain('/camps/new')
  expect(html).not.toContain(PLAN_CAMP_LIMIT_MESSAGE)
})
