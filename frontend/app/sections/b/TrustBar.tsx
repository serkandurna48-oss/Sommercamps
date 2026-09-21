interface TrustBarProps {
  label: string
  partners: string[]
  /** Markiert eine fehlende, nicht erfindbare Angabe sichtbar im UI. */
  pendingNote?: string
}

/**
 * Vertrauensleiste, Richtung B (CP-JK-105).
 *
 * Ersetzt die Kennzahlenzeile im Hero. Die Partnervereine standen bisher nur
 * klein in den Camp-Karten — dabei sind sie der einzige belegbare
 * Vertrauensbeweis, den die Seite heute hat.
 *
 * `pendingNote` rendert bewusst sichtbar: Eine fehlende Qualifikation wird
 * markiert, nicht erfunden.
 */
export default function TrustBar({ label, partners, pendingNote }: TrustBarProps) {
  if (partners.length === 0 && !pendingNote) return null

  return (
    <section
      aria-label={label}
      className="bg-[var(--surface-panel)] border-t-2 border-[var(--accent)]"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] whitespace-nowrap">
          {label}
        </p>

        {partners.length > 0 && (
          <>
            <span aria-hidden="true" className="hidden sm:block w-px h-7 bg-[var(--line-dark)]" />
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {partners.map((p, i) => (
                <li key={p} className="flex items-center gap-5">
                  <span className="font-display text-xl sm:text-2xl font-semibold tracking-[0.04em] uppercase text-[var(--text-on-dark)]">
                    {p}
                  </span>
                  {i < partners.length - 1 && (
                    <span aria-hidden="true" className="text-[#55607A] hidden sm:inline">·</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {pendingNote && (
          <p className="sm:ml-auto border border-dashed border-[#7A6A3A] text-[var(--accent-quiet)] text-xs font-semibold px-3 py-2 rounded-md">
            {pendingNote}
          </p>
        )}
      </div>
    </section>
  )
}
