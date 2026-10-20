import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'
import LegalShell from '../LegalShell'

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
    <LegalShell org={org}>
      <main className="legal-col" lang="de">
        <span className="legal-label">für die Online-Anmeldung bei {entityName}</span>
        <h1 className="legal-h1">Datenschutz&shy;erklärung</h1>

        {/* Sprungmarken-Inhaltsverzeichnis (8 Abschnitte > 4) */}
        <nav className="legal-toc" aria-label="Inhaltsverzeichnis">
          <p className="legal-toc-label">Inhalt</p>
          <ol>
            <li><a href="#ds-1">Verantwortlicher</a></li>
            <li><a href="#ds-2">Welche Daten werden erhoben</a></li>
            <li><a href="#ds-3">Zweck und Rechtsgrundlage</a></li>
            <li><a href="#ds-4">Speicherung</a></li>
            <li><a href="#ds-5">Speicherdauer</a></li>
            <li><a href="#ds-6">Weitergabe an Dritte</a></li>
            <li><a href="#ds-7">Ihre Rechte</a></li>
            <li><a href="#ds-8">Cookies und Tracking</a></li>
          </ol>
        </nav>

        <p className="legal-notice">
          Diese Seite beschreibt, welche Daten das Anmeldeformular tatsächlich abfragt und wie sie
          technisch verarbeitet werden. Sie ersetzt keine rechtliche Prüfung — bevor echte Anmeldungen
          über diese Seite laufen, sollte {entityName} den Text von einer sachkundigen Stelle
          gegenprüfen lassen (insbesondere Speicherdauer, siehe Abschnitt 5).
        </p>

        <div className="legal-body">
          <section id="ds-1">
            <h2>1. Verantwortlicher</h2>
            <address>
              <p style={{ fontWeight: 600 }}>{entityName}</p>
              {org.legal_address ? (
                org.legal_address.split('\n').map((line, i) => <p key={i}>{line}</p>)
              ) : (
                <p style={{ fontStyle: 'italic', opacity: 0.6 }}>Anschrift noch nicht angegeben.</p>
              )}
              <p style={{ marginTop: 8 }}>
                E-Mail:{' '}
                <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
              </p>
            </address>
          </section>

          <section id="ds-2">
            <h2>2. Welche Daten werden erhoben</h2>
            <p>Bei einer Anmeldung werden folgende Angaben abgefragt:</p>
            <ul>
              <li>Name und Geburtsdatum des Kindes</li>
              <li>Name, E-Mail-Adresse und Telefonnummer der Eltern</li>
              <li>Notfallkontakt (optional)</li>
              <li>Trikotgröße, medizinische Hinweise und Allergien (optional)</li>
              <li>Wer das Kind abholen darf (optional)</li>
              <li>Einwilligung zur Nutzung von Fotos (optional, separat abgefragt)</li>
            </ul>
          </section>

          <section id="ds-3">
            <h2>3. Zweck und Rechtsgrundlage</h2>
            <p>
              Die Daten werden ausschließlich zur Abwicklung der Camp-Anmeldung verwendet:
              Bestätigung, Organisation vor Ort, Kommunikation mit den Eltern. Rechtsgrundlage ist
              Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung); für Allergien/medizinische Hinweise
              Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung durch die Angabe im Formular).
            </p>
          </section>

          <section id="ds-4">
            <h2>4. Speicherung</h2>
            <p>
              Die Daten liegen in einer Supabase-Postgres-Datenbank (EU-Hosting). Zugriff haben der
              Anmeldeserver und angemeldete, berechtigte Verantwortliche des jeweiligen Anbieters.
            </p>
          </section>

          <section id="ds-5">
            <h2>5. Speicherdauer</h2>
            <p className="legal-notice">
              Für diesen Verein ist noch keine Löschfrist festgelegt — das System löscht Anmeldedaten
              aktuell nicht automatisch. {entityName} muss vor echtem Einsatz festlegen, wie lange
              Daten nach Camp-Ende aufbewahrt werden, und diesen Abschnitt entsprechend ergänzen.
            </p>
          </section>

          <section id="ds-6">
            <h2>6. Weitergabe an Dritte</h2>
            <p>
              Die Daten werden nicht verkauft oder für Werbezwecke genutzt. Eine Weitergabe erfolgt
              an folgende Dienstleister zur Durchführung der Anmeldung:
            </p>
            <ul>
              <li>
                <strong>Brevo</strong> (Sendinblue SAS, 55 rue d&apos;Amsterdam, 75008 Paris,
                Frankreich) – für den Versand der Bestätigungsmail. Übermittelt werden die
                E-Mail-Adresse der Eltern sowie Camp, Termin, Zahlungsdetails und Kontaktdaten des
                Anbieters. Keine Namen von Eltern oder Kindern, keine Geburtsdaten, Allergien oder
                medizinischen Hinweise.
              </li>
            </ul>
            <p>
              Darüber hinaus erfolgt eine Weitergabe nur, wenn dazu eine gesetzliche Verpflichtung
              besteht.
            </p>
          </section>

          <section id="ds-7">
            <h2>7. Ihre Rechte</h2>
            <p>
              Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18)
              und Widerspruch (Art. 21 DSGVO) — Anfragen an die oben genannte E-Mail-Adresse.
            </p>
          </section>

          <section id="ds-8">
            <h2>8. Cookies und Tracking</h2>
            <p>Diese Seite verwendet keine Tracking- oder Marketing-Cookies.</p>
          </section>
        </div>
      </main>
    </LegalShell>
  )
}
