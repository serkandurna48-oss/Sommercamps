type BrandMarkProps = {
  width?: number
  height?: number
  className?: string
}

// Bildmarke als Inline-SVG statt <img>, damit Rahmen und Mittellinie
// currentColor erben. Nur der Anstoßpunkt bleibt fest auf --accent
// (#D4581F) — siehe public/brand/campspilot-mark.svg für die
// Referenzform (Spielfeld 100×64, Seitenverhältnis eines Normspielfelds
// 105×68 m). width/height weglassen (z. B. beim Wasserzeichen), damit
// die Größe rein über CSS (.watermark) kommt statt über feste Pixelmaße.
export default function BrandMark({ width, height, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 112 76"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="6" width="100" height="64" rx="10" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M56 6V33M56 43V70" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="56" cy="38" r="15" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="56" cy="38" r="3.5" fill="var(--accent)" />
    </svg>
  )
}
