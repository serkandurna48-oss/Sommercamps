interface ContentPlaceholderProps {
  children: string
  /** 'dark' für dunkle Flächen, 'light' für helle. */
  tone?: 'dark' | 'light'
}

/**
 * Sichtbar markierte Inhaltslücke (CP-JK-105).
 *
 * Kein Designelement, sondern eine Arbeitsanweisung im UI: Hier fehlt eine
 * Angabe, die nicht erfunden werden darf. Der gestrichelte Rahmen unterscheidet
 * sie eindeutig von echtem Inhalt — niemand hält das versehentlich für fertig.
 */
export default function ContentPlaceholder({ children, tone = 'dark' }: ContentPlaceholderProps) {
  const toneClasses =
    tone === 'dark'
      ? 'border-[#7A6A3A] text-[var(--accent-quiet)]'
      : 'border-[#C5B48A] text-[var(--accent-ink)]'

  return (
    <p className={`border border-dashed rounded-md px-4 py-3 text-sm leading-relaxed ${toneClasses}`}>
      {children}
    </p>
  )
}
