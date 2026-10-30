// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DruckTestPage from './page'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
}))

vi.mock('../../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/dev/druck-test Entwicklungs-Gate', () => {
  for (const env of ['test', 'production'] as const) {
    it(`gibt notFound() in ${env} zurück, bevor searchParams aufgelöst werden`, async () => {
      vi.stubEnv('NODE_ENV', env)
      const neverResolves = new Promise<never>(() => {})
      await expect(DruckTestPage({ searchParams: neverResolves as never })).rejects.toThrow('notFound')
    })
  }

  it('rendert in development ohne Fehler', async () => {
    const html = renderToStaticMarkup(await DruckTestPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Lade Druckvorschau')
  })

  it('rendert mit allen Query-Parametern ohne Fehler', async () => {
    const html = renderToStaticMarkup(await DruckTestPage({
      searchParams: Promise.resolve({ n: '5', cols: 'all', logo: 'wide', brand: 'd71920', purpose: 'participants', days: '7' }),
    }))
    expect(html).toContain('Lade Druckvorschau')
  })
})
