// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _isMotionEnabled } from './motion'

describe('_isMotionEnabled', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn())
  })

  it('returns false when prefers-reduced-motion: reduce is set', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    expect(_isMotionEnabled()).toBe(false)
  })

  it('returns true when prefers-reduced-motion is not active', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList)
    expect(_isMotionEnabled()).toBe(true)
  })
})
