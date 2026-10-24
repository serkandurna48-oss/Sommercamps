import { describe, expect, it } from 'vitest'
import { isAllowedImageUrl } from './imageUrl'

describe('isAllowedImageUrl', () => {
  it.each([
    '',
    'https://example.com/logo.png',
    'https://cdn.example.com/clubs/ksv/ksv-logo.png',
    '/logo.svg',
    '/clubs/x.png',
    '/clubs/ksv/ksv-logo.png',
  ])('accepts %s', (value) => {
    expect(isAllowedImageUrl(value)).toBe(true)
  })

  it.each([
    '../x',
    '/foo/../bar',
    'javascript:alert(1)',
    'http://example.com/img.png',
    'data:image/png;base64,abc',
    '/foo bar.png',
    'relative-path.png',
  ])('rejects %s', (value) => {
    expect(isAllowedImageUrl(value)).toBe(false)
  })

  // Mutation probe: if the // check is removed, //evil.com/x would pass because
  // it starts with /. This test must turn red when that check is deleted.
  it('rejects protocol-relative URL //evil.com/x (mutation probe: // check)', () => {
    expect(isAllowedImageUrl('//evil.com/x')).toBe(false)
  })
})
