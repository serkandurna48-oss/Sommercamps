// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { TrainingOffer } from '../../../lib/saasAdminApi'
import OfferForm from './OfferForm'

vi.mock('../actions/trainingActions', () => ({ createOfferAction: vi.fn(), updateOfferAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const offer: TrainingOffer = {
  id: 'o1', slug: 'einzel', title: 'Einzel', kind: 'einzel', description: null, duration_minutes: 45, location: null,
  price_member_cents: 3000, price_nonmember_cents: 4000, status: 'draft', category: 'mental',
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
}
const render = (o?: TrainingOffer) => {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(<OfferForm orgSlug="demo" offer={o} brandStrong="#000" brandOn="#fff" />), 'text/html')
  return doc
}

describe('OfferForm Art des Angebots', () => {
  it('bietet optional alle fünf Arten an', () => {
    const select = render().querySelector('select[name="category"]') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
      ['', 'Keine Angabe'], ['fussball', 'Fußballtraining'], ['athletik', 'Athletiktraining'],
      ['mental', 'Mentaltraining'], ['videoanalyse', 'Videoanalyse'], ['premium', 'Premium-Paket'],
    ])
    expect(render().body.textContent).toContain('Art des Angebots')
  })

  it('wählt beim Bearbeiten die gespeicherte Art vor', () => {
    const select = render(offer).querySelector('select[name="category"]') as HTMLSelectElement
    expect(select.querySelector('option[selected]')?.getAttribute('value')).toBe('mental')
  })
})
