import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Impressum – KSV Baunatal Fußballschule',
  description: 'Impressum der Fußballschule KSV Baunatal.',
}

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Zurück zur Startseite
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Impressum</h1>
        <p className="text-gray-500 text-sm mb-10">Angaben gemäß § 5 TMG</p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Anbieter</h2>
            <address className="not-italic space-y-1">
              <p className="font-medium">KSV Baunatal e.V.</p>
              <p>Altenritter Str. 37</p>
              <p>34225 Baunatal</p>
            </address>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Vereinsregister</h2>
            <p>Eingetragener Verein</p>
            <p>Registergericht: [Amtsgericht – Kassel]</p>
            <p>Registernummer: [VR – 854]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Vertretungsberechtigter Vorstand</h2>
            <p>[Name des Vorstands – Georg Heinemann]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Kontakt</h2>
            <p>Ansprechpartner Fußballschule: Ergün Ünal</p>
            <p>
              E-Mail:{' '}
              <a href="mailto:Erguen.uenal@fussball.ksv-baunatal.de" className="underline hover:text-gray-900">
                Erguen.uenal@fussball.ksv-baunatal.de
              </a>
            </p>
            <p>Telefon: 0170 9927281</p>
            <p className="mt-2">
              Allgemeiner Vereinskontakt:{' '}
              <a href="mailto:info@ksv-baunatal.de" className="underline hover:text-gray-900">
                info@ksv-baunatal.de
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</h2>
            <p>Ergün Ünal</p>
            <p>Altenritter Str. 37, 34225 Baunatal</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Haftungsausschluss</h2>
            <p>
              Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
              Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-xs text-gray-400">
        © 2026 KSV Baunatal e.V. ·{' '}
        <Link href="/" className="underline hover:text-gray-700">Startseite</Link>
        {' · '}
        <Link href="/datenschutz" className="underline hover:text-gray-700">Datenschutz</Link>
      </footer>
    </div>
  )
}
