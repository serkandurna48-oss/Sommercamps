import { describe, expect, it } from 'vitest'
import { __internal, computeBrandTokens } from './brandPipeline'

const { contrastRatio, hexToRgb } = __internal

function contrastAgainstPaper(hex: string): number {
  return contrastRatio(hexToRgb(hex), hexToRgb('#F4F5F2'))
}

describe('computeBrandTokens — Auftrag Abschnitt 3.3', () => {
  it('KSV Baunatal (#C8102E) bleibt unverändert — roh schon >=4.5:1', () => {
    const tokens = computeBrandTokens('#C8102E')
    expect(tokens.brand).toBe('#C8102E')
    expect(tokens.brandStrong).toBe('#C8102E')
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeGreaterThanOrEqual(4.5)
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeCloseTo(5.38, 1)
  })

  it('JK Performance Academy (#C79B3B) wird abgedunkelt, bis Kontrast >=4.5:1', () => {
    const tokens = computeBrandTokens('#C79B3B')
    expect(tokens.brand).toBe('#C79B3B') // roh bleibt für die fünf non-Text-Stellen erhalten
    expect(tokens.brandStrong).not.toBe('#C79B3B') // aber für Text/Button abgedunkelt
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeGreaterThanOrEqual(4.5)
  })

  it('brandOn wählt Weiß, wenn Weiß auf brandStrong >=4.5:1 erreicht (beide Testfälle)', () => {
    expect(computeBrandTokens('#C8102E').brandOn).toBe('#FFFFFF')
    expect(computeBrandTokens('#C79B3B').brandOn).toBe('#FFFFFF')
  })

  it('Grenzfall: fast weiß wird so weit abgedunkelt, bis 4.5:1 erreicht ist', () => {
    const tokens = computeBrandTokens('#FEFEFE')
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeGreaterThanOrEqual(4.5)
  })

  it('Grenzfall: fast schwarz erfüllt 4.5:1 bereits ohne Anpassung', () => {
    const tokens = computeBrandTokens('#0A0A0A')
    expect(tokens.brandStrong).toBe('#0A0A0A')
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeGreaterThanOrEqual(4.5)
  })

  it('Grenzfall: ungültiger Hex fällt auf die CampsPilot-Eigenfarbe zurück', () => {
    const tokens = computeBrandTokens('not-a-color')
    expect(tokens.brand).toBe('#2B6F4C')
    expect(contrastAgainstPaper(tokens.brandStrong)).toBeGreaterThanOrEqual(4.5)
  })

  it('null/undefined (Mandant ohne primary_color) fällt auf die CampsPilot-Eigenfarbe zurück', () => {
    expect(computeBrandTokens(null).brand).toBe('#2B6F4C')
    expect(computeBrandTokens(undefined).brand).toBe('#2B6F4C')
  })
})
