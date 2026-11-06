// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerSummary } from '../../../lib/saasAdminApi'
import PlayerList from './PlayerList'

vi.mock('../preview/AdminLink', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
}))

const player = (patch: Partial<PlayerSummary>): PlayerSummary => ({
  id: 'p1', first_name: 'Lena', last_name: 'Muster', birth_date: '2015-03-05', age: 11, last_booking_at: null,
  booking_count: 0, note_count: 0, open_goal_count: 0, ...patch,
})

describe('Spielerliste: Mitglied-Chip', () => {
  it('zeigt "Mitglied" nur bei is_member', () => {
    const html = renderToStaticMarkup(<PlayerList orgSlug="demo" players={[
      player({ is_member: true }), player({ id: 'p2', first_name: 'Tom', is_member: false }), player({ id: 'p3', first_name: 'Ida' }),
    ]} />)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const links = [...doc.querySelectorAll('a')]
    expect(links.map(link => link.textContent?.includes('Mitglied'))).toEqual([true, false, false])
  })
})
