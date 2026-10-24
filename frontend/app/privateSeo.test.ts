import { describe, expect, it, vi } from 'vitest'

vi.mock('next/font/google', () => ({ Oswald: () => ({ variable: '' }), Work_Sans: () => ({ variable: '' }) }))
vi.mock('./components/saas/StagingBanner', () => ({ default: () => null }))

import { metadata as adminMetadata } from './admin/layout'
import { metadata as platformMetadata } from './platform/layout'
import { metadata as pilotMetadata } from './pilot/layout'

describe('Nicht öffentliche Routen', () => {
  it.each([
    ['Admin', adminMetadata],
    ['Plattform einschließlich Login', platformMetadata],
    ['Vereinsverwaltung einschließlich Login', pilotMetadata],
  ])('%s erbt noindex aus dem gemeinsamen Layout', (_name, metadata) => {
    expect(metadata.robots).toEqual({ index: false })
  })
})
