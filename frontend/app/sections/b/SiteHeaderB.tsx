import Image from 'next/image'

export interface NavItem {
  label: string
  href: string
}

interface SiteHeaderBProps {
  clubName: string
  logoSrc?: string
  navItems: NavItem[]
  /** Kurzform fuer schmale Geraete — sonst verdraengt der Button den Namen. */
  ctaLabelShort: string
  ctaLabelLong: string
  ctaHref: string
}

/**
 * Kopfzeile, Richtung B (CP-JK-105).
 *
 * Dunkel statt hell. Das JK-Wappen liegt auf schwarzem Grund — auf der hellen
 * Fassung brauchte es dafür einen Chip (logoChipColor), damit der Hintergrund
 * nicht wie ein Bildfehler wirkt. Hier sitzt es ohne Hilfskonstruktion.
 */
export default function SiteHeaderB({
  clubName,
  logoSrc,
  navItems,
  ctaLabelShort,
  ctaLabelLong,
  ctaHref,
}: SiteHeaderBProps) {
  return (
    <header className="sticky top-0 z-50 bg-[var(--surface-inverse)]/95 backdrop-blur-sm border-b border-[var(--line-dark)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center gap-6">
        <a href="#top" className="flex items-center gap-3 min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]">
          {logoSrc && (
            <Image
              src={logoSrc}
              alt={`Wappen ${clubName}`}
              width={44}
              height={44}
              unoptimized
              className="w-11 h-11 object-cover rounded-md shrink-0"
            />
          )}
          <span className="font-display font-bold text-base sm:text-xl tracking-[0.04em] sm:tracking-[0.06em] uppercase text-[var(--text-on-dark)] leading-tight">
            {clubName}
          </span>
        </a>

        <nav aria-label="Hauptnavigation" className="hidden lg:flex flex-1 justify-center gap-9">
          {navItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="text-[15px] font-medium text-[var(--text-on-dark-muted)] hover:text-[var(--text-on-dark)] border-b-2 border-transparent hover:border-[var(--accent)] pb-0.5 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-inverse)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href={ctaHref}
          className="ml-auto lg:ml-0 bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold px-5 sm:px-6 py-3 rounded-[var(--radius-pill)] hover:brightness-110 active:brightness-95 transition-[filter] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-on-dark)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
        >
          <span className="sm:hidden">{ctaLabelShort}</span>
          <span className="hidden sm:inline">{ctaLabelLong}</span>
        </a>
      </div>
    </header>
  )
}
