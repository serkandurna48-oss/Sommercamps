import ClubLogo from '../components/ClubLogo'

interface SiteHeaderProps {
  clubName: string
  subtitle: string
  ctaHref: string
  /** Kurzfassung der CTA für schmale Viewports (< sm). */
  ctaLabelShort: string
  /** Langfassung der CTA ab sm. */
  ctaLabelLong: string
}

/**
 * Sticky-Kopfzeile. Extrahiert aus page.tsx (CP-JK-103), Markup unverändert —
 * die Beschriftungen kommen jetzt als Props statt aus einer Verzweigung auf
 * PROGRAMS.length.
 */
export default function SiteHeader({
  clubName,
  subtitle,
  ctaHref,
  ctaLabelShort,
  ctaLabelLong,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ClubLogo />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-base leading-tight truncate">{clubName}</p>
            <p className="text-gray-400 text-xs tracking-widest uppercase truncate">{subtitle}</p>
          </div>
        </div>
        <a
          href={ctaHref}
          className="bg-black text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-xl hover:opacity-90 active:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 shrink-0 whitespace-nowrap"
        >
          <span className="sm:hidden">{ctaLabelShort}</span>
          <span className="hidden sm:inline">{ctaLabelLong}</span>
        </a>
      </div>
    </header>
  )
}
