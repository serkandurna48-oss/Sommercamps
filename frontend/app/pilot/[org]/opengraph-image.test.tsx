import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const captured = vi.hoisted(() => ({ element: null as ReactElement | null }))
vi.mock('../../lib/saasApi', () => ({ fetchOrganization: vi.fn() }))
vi.mock('next/og', async () => {
  // Load the real renderer through Node: the Windows VM pool rewrites import.meta.url.
  const { createRequire } = await import('node:module')
  const { ImageResponse } = createRequire(import.meta.url)('next/dist/compiled/@vercel/og/index.node.js') as typeof import('next/og')
  return {
    ImageResponse: class extends ImageResponse {
      constructor(element: ReactElement, options: ConstructorParameters<typeof ImageResponse>[1]) {
        captured.element = element
        super(element, options)
      }
    },
  }
})

import { fetchOrganization } from '../../lib/saasApi'
import OpenGraphImage from './opengraph-image'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('rendert ein echtes PNG in 1200 × 630 mit Vereinsname, Farbbalken und Logo ohne Schriftdownload', async () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example')
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  vi.mocked(fetchOrganization).mockResolvedValue({
    slug: 'testverein', name: 'Testverein Fußball', primary_color: '#123456', logo_url: pixel,
  } as NonNullable<Awaited<ReturnType<typeof fetchOrganization>>>)
  const network = vi.fn(async () => { throw new Error('Unerwarteter Netzwerkzugriff') })
  vi.stubGlobal('fetch', network)
  const response = await OpenGraphImage({ params: Promise.resolve({ org: 'testverein' }) })
  const png = Buffer.from(await response.arrayBuffer())
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.readUInt32BE(16)).toBe(1200)
  expect(png.readUInt32BE(20)).toBe(630)
  const markup = renderToStaticMarkup(captured.element)
  expect(markup).toContain('Testverein Fußball')
  expect(markup).toContain('Fußballcamps')
  expect(markup).toContain('background:#123456')
  expect(markup).toContain(pixel)
  expect(network).not.toHaveBeenCalled()
})

it('rendert für unbekannte Vereine ein neutrales Bild', async () => {
  vi.mocked(fetchOrganization).mockResolvedValue(null)
  const response = await OpenGraphImage({ params: Promise.resolve({ org: 'unbekannt' }) })
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  const markup = renderToStaticMarkup(captured.element)
  expect(markup).toContain('CampsPilot')
  expect(markup).not.toContain('<img')
})
