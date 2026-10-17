import { describe, expect, it } from 'vitest'
import { __internal, computeBrand, computeBrandSafe, FALLBACK_BRAND_COLOR } from './brandPipeline'

const { contrastRatio, hexToRgb, relativeLuminance } = __internal

const TRADITION_SURFACE = '#FFFFFF'
const AKADEMIE_SURFACE = '#161C1A'

function contrastAgainst(hex: string, ground: string): number {
  return contrastRatio(hexToRgb(hex), hexToRgb(ground))
}

describe('computeBrand — Ticket §5, Pflicht-Testfälle §12', () => {
  it('KSV (#C8102E) auf tradition (#FFFFFF): roh schon >=4,5:1, bleibt unverändert', () => {
    const result = computeBrand('#C8102E', TRADITION_SURFACE)
    expect(result.brand).toBe('#C8102E')
    expect(result.strong).toBe('#C8102E')
    expect(result.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('JK (#C79B3B) auf tradition (#FFFFFF): roh nur ~2,3:1, Pipeline dunkelt ab auf >=4,5:1', () => {
    const rawRatio = contrastAgainst('#C79B3B', TRADITION_SURFACE)
    expect(rawRatio).toBeLessThan(4.5)

    const result = computeBrand('#C79B3B', TRADITION_SURFACE)
    expect(result.brand).toBe('#C79B3B') // roh bleibt für die non-Text-Stellen erhalten
    expect(result.strong).not.toBe('#C79B3B') // für Text/Button abgedunkelt
    expect(result.ratio).toBeGreaterThanOrEqual(4.5)
    expect(relativeLuminance(hexToRgb(result.strong))).toBeLessThan(
      relativeLuminance(hexToRgb('#C79B3B')),
    )
  })

  it('JK (#C79B3B) auf akademie (#161C1A): erreicht bereits roh >=4,5:1 — Pipeline lässt unverändert (kein Widerspruch zu §5: die Garantie ist ">=4,5:1", nicht "wird immer verschoben")', () => {
    const result = computeBrand('#C79B3B', AKADEMIE_SURFACE)
    expect(result.brand).toBe('#C79B3B')
    expect(result.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('beidseitig: up = lum(ground) < 0.2 entscheidet Richtung (Mittelgrau, das auf beiden Gründen roh knapp unter 4,5:1 liegt)', () => {
    const midGray = '#808080'
    const onLight = computeBrand(midGray, TRADITION_SURFACE)
    const onDark = computeBrand(midGray, AKADEMIE_SURFACE)
    const inputLuminance = relativeLuminance(hexToRgb(midGray))

    expect(onLight.ratio).toBeGreaterThanOrEqual(4.5)
    expect(onDark.ratio).toBeGreaterThanOrEqual(4.5)
    // Hellgrund -> abgedunkelt (Lightness sinkt)
    expect(relativeLuminance(hexToRgb(onLight.strong))).toBeLessThan(inputLuminance)
    // Dunkelgrund -> aufgehellt (Lightness steigt)
    expect(relativeLuminance(hexToRgb(onDark.strong))).toBeGreaterThan(inputLuminance)
  })

  it('brandOn wählt Weiß oder #101514, je nachdem was auf `strong` >=4,5:1 erreicht', () => {
    const dark = computeBrand('#C8102E', TRADITION_SURFACE)
    expect(['#FFFFFF', '#101514']).toContain(dark.on)
    expect(contrastAgainst(dark.on, dark.strong)).toBeGreaterThanOrEqual(4.5)
  })

  it('computeBrandSafe fällt bei ungültigem/fehlendem Hex auf die CampsPilot-Eigenfarbe zurück', () => {
    expect(computeBrandSafe('not-a-color', TRADITION_SURFACE).brand).toBe(FALLBACK_BRAND_COLOR)
    expect(computeBrandSafe(null, TRADITION_SURFACE).brand).toBe(FALLBACK_BRAND_COLOR)
    expect(computeBrandSafe(undefined, TRADITION_SURFACE).brand).toBe(FALLBACK_BRAND_COLOR)
  })
})
