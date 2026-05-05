import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – KSV Baunatal Fußballschule',
  description: 'Datenschutzerklärung für das Online-Anmeldesystem der Fußballschule KSV Baunatal.',
}

export default function DatenschutzPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Datenschutzerklärung</h1>
        <p className="text-gray-500 text-sm mb-10">Stand: Mai 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Verantwortlicher</h2>
            <p>
              Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist:
            </p>
            <address className="not-italic mt-3 space-y-1 text-gray-700">
              <p className="font-medium">KSV Baunatal e.V.</p>
              <p>Altenritter Str. 37, 34225 Baunatal</p>
              <p>34225 Baunatal</p>
              <p>E-Mail: <a href="mailto:info@ksv-baunatal.de" className="underline hover:text-gray-900">info@ksv-baunatal.de</a></p>
            </address>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Welche Daten werden erhoben?</h2>
            <p>
              Beim Ausfüllen des Anmeldeformulars erheben wir folgende Daten:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1">
              <li>Vor- und Nachname des Kindes</li>
              <li>Geburtsdatum des Kindes</li>
              <li>Name des Elternteils / Erziehungsberechtigten</li>
              <li>E-Mail-Adresse</li>
              <li>Telefonnummer</li>
              <li>Gewünschter Camptermin</li>
              <li>Trikotnummer / Konfektionsgröße (optional)</li>
              <li>Allergien und Unverträglichkeiten (optional)</li>
              <li>Sonstige Hinweise (optional)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Zweck und Rechtsgrundlage der Verarbeitung</h2>
            <p>
              Die erhobenen Daten werden ausschließlich zur Abwicklung der Anmeldung für das Sommercamp
              der Fußballschule KSV Baunatal verwendet. Dies umfasst:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-1">
              <li>Bestätigung und Verwaltung der Anmeldung</li>
              <li>Kommunikation mit den Erziehungsberechtigten (Termininfos, Kosten, Rückfragen)</li>
              <li>Organisation des Camps (Gruppenplanung, Verpflegung bei Unverträglichkeiten)</li>
            </ul>
            <p className="mt-3">
              Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO
              (Vertragsanbahnung bzw. Erfüllung eines Vertrages) sowie, soweit gesundheitsbezogene
              Daten (Allergien) angegeben werden, Art.&nbsp;9 Abs.&nbsp;2 lit.&nbsp;a DSGVO
              (ausdrückliche Einwilligung durch Angabe im Formular).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Speicherung und Sicherheit</h2>
            <p>
              Die Daten werden in einer gesicherten Datenbank (Supabase, Hosting in der EU) gespeichert.
              Der Zugang ist durch Row-Level-Security und einen geheimen Admin-Schlüssel geschützt.
              Öffentlicher Lesezugriff auf Anmeldedaten ist technisch ausgeschlossen.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Weitergabe an Dritte</h2>
            <p>
              Deine Daten werden nicht an Dritte weitergegeben, verkauft oder für Werbezwecke genutzt.
              Eine Weitergabe erfolgt nur, wenn wir gesetzlich dazu verpflichtet sind.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Speicherdauer</h2>
            <p>
              Die Daten werden nach Abschluss des Sommercamps und Ablauf etwaiger gesetzlicher
              Aufbewahrungsfristen gelöscht, spätestens jedoch 12 Monate nach dem jeweiligen
              Camptermin. Auf Wunsch löschen wir deine Daten früher — einfach eine E-Mail an uns.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Deine Rechte</h2>
            <p>Du hast das Recht auf:</p>
            <ul className="list-disc list-inside mt-3 space-y-1">
              <li>Auskunft über die zu dir gespeicherten Daten (Art.&nbsp;15 DSGVO)</li>
              <li>Berichtigung unrichtiger Daten (Art.&nbsp;16 DSGVO)</li>
              <li>Löschung deiner Daten (Art.&nbsp;17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art.&nbsp;18 DSGVO)</li>
              <li>Widerspruch gegen die Verarbeitung (Art.&nbsp;21 DSGVO)</li>
            </ul>
            <p className="mt-3">
              Anfragen bitte an:{' '}
              <a href="mailto:info@ksv-baunatal.de" className="underline hover:text-gray-900">
                info@ksv-baunatal.de
              </a>
            </p>
            <p className="mt-3">
              Du hast außerdem das Recht, dich bei der zuständigen Datenschutzaufsichtsbehörde
              zu beschweren (Hessischer Beauftragter für Datenschutz und Informationsfreiheit,
              <a href="https://datenschutz.hessen.de" className="underline hover:text-gray-900 ml-1">datenschutz.hessen.de</a>).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Cookies und Tracking</h2>
            <p>
              Diese Website verwendet keine Cookies zu Tracking- oder Werbezwecken.
              Es werden keine Analyse- oder Marketing-Tools eingesetzt.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-xs text-gray-400">
        © 2026 KSV Baunatal e.V. ·{' '}
        <Link href="/" className="underline hover:text-gray-700">Startseite</Link>
      </footer>
    </div>
  )
}
