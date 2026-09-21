import Image from 'next/image'
import Link from 'next/link'
import ContentPlaceholder from './ContentPlaceholder'

interface SiteFooterBProps {
  clubName: string
  logoSrc?: string
  description: string
  contactLines: string[]
  /** Fehlende Kontaktwege — sichtbar markiert statt erfunden. */
  contactPending?: string
  privacyPurpose: string
  copyrightName: string
}

/**
 * Footer, Richtung B (CP-JK-105).
 * Gleiche Fläche wie der Header, damit die Seite sauber schliesst.
 */
export default function SiteFooterB({
  clubName,
  logoSrc,
  description,
  contactLines,
  contactPending,
  privacyPurpose,
  copyrightName,
}: SiteFooterBProps) {
  return (
    <footer className="bg-[var(--surface-inverse)] border-t border-[var(--line-dark)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 mb-10">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-4">
              {logoSrc && (
                <Image src={logoSrc} alt="" width={38} height={38} unoptimized className="w-9.5 h-9.5 w-[38px] h-[38px] object-cover rounded-md" />
              )}
              <p className="font-display font-bold text-lg tracking-[0.06em] uppercase text-[var(--text-on-dark)]">
                {clubName}
              </p>
            </div>
            <p className="text-[15px] leading-relaxed text-[var(--text-quiet)]">{description}</p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--accent-quiet)] mb-4">
              Kontakt
            </p>
            <ul className="flex flex-col gap-2 mb-3">
              {contactLines.map(l => (
                <li key={l} className="text-[15px] text-[var(--text-on-dark-muted)]">{l}</li>
              ))}
            </ul>
            {contactPending && <ContentPlaceholder>{contactPending}</ContentPlaceholder>}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--accent-quiet)] mb-4">
              Rechtliches
            </p>
            <p className="text-[15px] leading-relaxed text-[var(--text-on-dark-muted)] mb-4" id="datenschutz">
              Deine Daten werden ausschließlich zur Bearbeitung {privacyPurpose}{' '}genutzt.
              Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/datenschutz"
                className="text-[15px] text-[var(--text-on-dark-muted)] underline underline-offset-2 hover:text-[var(--text-on-dark)] transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
              >
                Datenschutzerklärung
              </Link>
              <Link
                href="/impressum"
                className="text-[15px] text-[var(--text-on-dark-muted)] underline underline-offset-2 hover:text-[var(--text-on-dark)] transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-inverse)]"
              >
                Impressum
              </Link>
            </div>
          </div>
        </div>

        <p className="border-t border-[var(--line-dark)] pt-6 text-[13px] text-[#6B7488]">
          © 2026 {copyrightName} · Alle Rechte vorbehalten
        </p>
      </div>
    </footer>
  )
}
