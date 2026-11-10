import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, test, vi } from 'vitest'
import BookingPage, { metadata } from './page'
import { getPublicOrganization } from '../../publicData'

vi.mock('../../publicData', () => ({ getPublicOrganization: vi.fn() }))
vi.mock('../../LegalShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div> }))
vi.mock('../../PublicLoadError', () => ({ default: () => <p>load error</p> }))
vi.mock('./BookingView', () => ({ default: (p: { orgSlug: string; token: string }) => <p data-view>{p.orgSlug}/{p.token}</p> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

beforeEach(() => vi.clearAllMocks())

test('the page is not indexable and sends no referrer (the token is a credential)', () => {
  expect(metadata.robots).toMatchObject({ index: false, follow: false })
  expect(metadata.referrer).toBe('no-referrer')
})

test('renders the booking view for a known organization', async () => {
  vi.mocked(getPublicOrganization).mockResolvedValue({ slug: 'ksv', name: 'KSV' } as never)
  const html = renderToStaticMarkup(await BookingPage({ params: Promise.resolve({ org: 'ksv', token: 'abc' }) }))
  expect(html).toContain('ksv/abc')
})

test('unknown organization is a 404', async () => {
  vi.mocked(getPublicOrganization).mockResolvedValue(null)
  await expect(BookingPage({ params: Promise.resolve({ org: 'x', token: 'abc' }) })).rejects.toThrow('NEXT_NOT_FOUND')
})
