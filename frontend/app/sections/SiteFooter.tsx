import type { ReactNode } from 'react'
import Link from 'next/link'
import ClubLogo from '../components/ClubLogo'

interface SiteFooterProps {
  /** Anzeigename inklusive etwaigem Rechtsformzusatz. */
  displayName: string
  description: string
  contactLines: ReactNode
  /** Satzteil im Datenschutzhinweis, z. B. "deiner Anfrage". */
  privacyPurpose: string
  copyrightName: string
}

/**
 * Footer. Extrahiert aus page.tsx (CP-JK-103), Markup unverändert.
 * Die Rechtsform-Suffixe und Kontaktzeilen kommen jetzt als Props statt aus
 * Verzweigungen auf PROGRAMS.length.
 */
export default function SiteFooter({
  displayName,
  description,
  contactLines,
  privacyPurpose,
  copyrightName,
}: SiteFooterProps) {
  return (
    <footer className="bg-gray-950 text-gray-400 py-14 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-10 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <ClubLogo />
              <p className="text-white font-bold">{displayName}</p>
            </div>
            <p className="text-sm leading-relaxed">{description}</p>
          </div>
          <div>
            <p className="text-white font-semibold mb-3 text-sm">Kontakt</p>
            <ul className="space-y-1.5 text-sm">{contactLines}</ul>
          </div>
          <div>
            <p className="text-white font-semibold mb-3 text-sm">Rechtliches</p>
            <p className="text-sm leading-relaxed" id="datenschutz">
              Deine Daten werden ausschließlich zur Bearbeitung {privacyPurpose}{' '}genutzt.
              Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/datenschutz"
                className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                Datenschutzerklärung
              </Link>
              <Link
                href="/impressum"
                className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                Impressum
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 text-xs text-gray-600 text-center">
          © 2026 {copyrightName} · Alle Rechte vorbehalten
        </div>
      </div>
    </footer>
  )
}
