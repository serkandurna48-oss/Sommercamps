type BrandMarkProps = {
  width?: number
  height?: number
  className?: string
}

// Bildmarke als Inline-SVG statt <img>, damit die Linien currentColor
// erben. Nur der Wimpel bleibt fest auf --accent (#D4581F) — siehe
// public/brand/campspilot-mark.svg für die Referenzform.
export default function BrandMark({ width = 21, height = 24, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 28 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 4V29H26"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 18A11 11 0 0 1 14 29"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M3.7 4.7L17 9L3.7 13.3Z" fill="var(--accent)" />
    </svg>
  )
}
