import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDetailScreen from './MemberDetailScreen'
import MemberRow from '../training/MemberRow'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'
import type { ClubMember, ClubMemberDetail } from '../../../lib/saasAdminApi'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/mitglieder', useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../actions/trainingActions', () => ({ setMemberActiveAction: vi.fn() }))

const fixtures = getPreviewFixtures()
const member: ClubMemberDetail = {
  id: 'm-1', first_name: 'Anna', last_name: 'Muster', birth_date: '2015-03-05', member_number: 'M-7', active: true, source: 'csv',
  extra: { Mannschaft: 'U11', 'Verein seit': '2019' }, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-05T10:00:00Z', player: null,
}
const render = (m: ClubMemberDetail, modules = ['camps', 'members', 'players']) =>
  renderToStaticMarkup(<MemberDetailScreen orgSlug="demo" org={{ ...fixtures.org, modules }} member={m} />)

it('zeigt alle Stammdaten und jedes Zusatzfeld mit seiner Bezeichnung', () => {
  const html = render(member)
  for (const text of ['Anna', 'Muster', '05.03.2015', 'M-7', 'Per CSV importiert', 'Mannschaft', 'U11', 'Verein seit', '2019']) expect(html).toContain(text)
  expect(html).toContain('data-extra="Mannschaft"')
  expect(html).toContain('data-extra="Verein seit"')
})

it('Hinweis ohne Zusatzfelder und ohne Spielerakte (Du-Form)', () => {
  const html = render({ ...member, extra: {} })
  expect(html).toContain('keine Zusatzfelder gespeichert')
  expect(html).toContain('noch keine Spielerakte')
  expect(html).toContain('deinem CSV-Import')
})

it('verlinkt die Spielerakte, nur mit Spieler-Modul', () => {
  const linked = { ...member, player: { id: 'p-9', first_name: 'Anna', last_name: 'Muster', birth_date: '2015-03-05' } }
  expect(render(linked)).toContain('href="/pilot/demo/spieler/p-9"')
  expect(render(linked, ['camps', 'members'])).not.toContain('Spielerakte')
})

it('bietet Status ändern an', () => {
  expect(render(member)).toContain('Auf inaktiv setzen')
  expect(render({ ...member, active: false })).toContain('Auf aktiv setzen')
})

it('Listenzeile ist klickbar und führt zur Detailseite', () => {
  const row: ClubMember = member
  const html = renderToStaticMarkup(<ul><MemberRow orgSlug="demo" member={row} /></ul>)
  expect(html).toContain('href="/pilot/demo/mitglieder/m-1"')
  expect(html).toContain('after:absolute')
})
