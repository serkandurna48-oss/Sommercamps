import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'

/**
 * Gegenstück zu impressum/page.tsx — siehe dessen Kommentar für den
 * Blocker-Kontext. Die Datenkategorien/Zwecke unten sind das, was dieses
 * System (backend_saas/app/schemas.py::RegistrationCreate) TATSÄCHLICH
 * abfragt — keine erfundene Rechtsberatung, sondern eine Tatsachen-
 * beschreibung der echten Formularfelder. Bewusst OHNE erfundene
 * Speicherdauer (anders als die KSV-Vorlage unter /datenschutz, deren
 * "12 Monate" eine von KSV getroffene Entscheidung ist, die es in
 * backend_saas nicht gibt — hier gibt es aktuell KEINE automatische
 * Löschung; das muss der Verein selbst festlegen, siehe
 * docs/saas/legal-data-needed.md). Diese Seite ersetzt keine
 * Rechtsberatung — expliziter Hinweis unten.
 */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Datenschutz – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function OrgDatenschutzPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const entityName = org.legal_name ?? org.name

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link href={`/pilot/${orgSlug}`} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            ← Zurück zu {org.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Datenschutzerklärung</h1>
        <p className="mb-10 text-sm text-gray-500">für die Online-Anmeldung bei {entityName}</p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">
          <section className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Diese Seite beschreibt, welche Daten das Anmeldeformular tatsächlich abfragt und wie sie
            technisch verarbeitet werden. Sie ersetzt keine rechtliche Prüfung — bevor echte Anmeldungen
            über diese Seite laufen, sollte {entityName} den Text von einer sachkundigen Stelle
            gegenprüfen lassen (insbesondere Speicherdauer, siehe Abschnitt 5).
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">1. Verantwortlicher</h2>
            <address className="not-italic">
              <p className="font-medium">{entityName}</p>
              {org.legal_address ? (
                org.legal_address.split('\n').map((line, i) => <p key={i}>{line}</p>)
              ) : (
                <p className="italic text-gray-400">Anschrift noch nicht angegeben.</p>
              )}
              <p className="mt-2">
                E-Mail:{' '}
                <a href={`mailto:${org.contact_email}`} className="underline hover:text-gray-900">
                  {org.contact_email}
                </a>
              </p>
            </address>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">2. Welche Daten werden erhoben</h2>
            <p>Bei einer Anmeldung werden folgende Angaben abgefragt:</p>
            <ul className="mt-3 list-inside list-disc space-y-1">
              <li>Name und Geburtsdatum des Kindes</li>
              <li>Name, E-Mail-Adresse und Telefonnummer der Eltern</li>
              <li>Notfallkontakt (optional)</li>
              <li>Trikotgröße, medizinische Hinweise und Allergien (optional)</li>
              <li>Wer das Kind abholen darf (optional)</li>
              <li>Einwilligung zur Nutzung von Fotos (optional, separat abgefragt)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">3. Zweck und Rechtsgrundlage</h2>
            <p>
              Die Daten werden ausschließlich zur Abwicklung der Camp-Anmeldung verwendet:
              Bestätigung, Organisation vor Ort, Kommunikation mit den Eltern. Rechtsgrundlage ist
              Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung); für Allergien/medizinische Hinweise
              Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung durch die Angabe im Formular).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">4. Speicherung</h2>
            <p>
              Die Daten liegen in einer Supabase-Postgres-Datenbank (EU-Hosting). Lesender/schreibender
              Zugriff ist auf den Anmeldeserver beschränkt — es gibt keinen direkten Browserzugriff auf
              die Anmeldedaten.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">5. Speicherdauer</h2>
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              Für diesen Verein ist noch keine Löschfrist festgelegt — das System löscht Anmeldedaten
              aktuell nicht automatisch. {entityName} muss vor echtem Einsatz festlegen, wie lange
              Daten nach Camp-Ende aufbewahrt werden, und diesen Abschnitt entsprechend ergänzen.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">6. Weitergabe an Dritte</h2>
            <p>Die Daten werden nicht verkauft oder für Werbezwecke genutzt. Eine Weitergabe erfolgt nur, wenn dazu eine gesetzliche Verpflichtung besteht.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">7. Ihre Rechte</h2>
            <p>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18) und Widerspruch (Art. 21 DSGVO) — Anfragen an die oben genannte E-Mail-Adresse.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">8. Cookies und Tracking</h2>
            <p>Diese Seite verwendet keine Tracking- oder Marketing-Cookies.</p>
          </section>
        </div>
      </main>
    </div>
  )
}
