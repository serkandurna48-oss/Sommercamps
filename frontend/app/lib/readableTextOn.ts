function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

/**
 * Returns '#ffffff' if white has ≥4.5:1 WCAG contrast against `hex`, '#111111' otherwise.
 * Determines readable button text color for a given solid background color.
 */
export function readableTextOn(hex: string): string {
  const [r, g, b] = parseHex(hex)
  const bg = luminance(r, g, b)
  const whiteContrast = (1.05) / (bg + 0.05)
  return whiteContrast >= 4.5 ? '#ffffff' : '#111111'
}
