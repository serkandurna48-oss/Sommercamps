import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'
import LegalShell from '../LegalShell'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Teilnahmebedingungen – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function OrgTeilnahmebedingungenPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const entityName = org.legal_name ?? org.name

  return (
    <LegalShell org={org}>
      <main className="legal-col" lang="de">
        <span className="legal-label">{entityName}</span>
        <h1 className="legal-h1">Teilnahme&shy;bedingungen</h1>

        {/* Sprungmarken-Inhaltsverzeichnis (5 Abschnitte > 4) */}
        <nav className="legal-toc" aria-label="Inhaltsverzeichnis">
          <p className="legal-toc-label">Inhalt</p>
          <ol>
            <li><a href="#tb-1">Geltungsbereich</a></li>
            <li><a href="#tb-2">Anmeldung und Vertrag</a></li>
            <li><a href="#tb-3">Zahlung</a></li>
            <li><a href="#tb-4">Rücktritt und Stornierung</a></li>
            <li><a href="#tb-5">Haftung und Verhalten</a></li>
          </ol>
        </nav>

        <div className="legal-body">
          <section id="tb-1">
            <h2>1. Geltungsbereich</h2>
            <p>
              Diese Teilnahmebedingungen gelten für alle Fußball-Feriencamps, die von {entityName}
              über das CampsPilot-Anmeldesystem angeboten werden. Mit der Anmeldung erkennt der
              gesetzliche Vertreter des Teilnehmers diese Bedingungen an.
            </p>
          </section>

          <section id="tb-2">
            <h2>2. Anmeldung und Vertrag</h2>
            <p>
              Die Anmeldung erfolgt ausschließlich über das Online-Formular. Ein verbindlicher
              Vertrag kommt mit Eingang der Anmeldebestätigung per E-Mail zustande. Die Teilnahme
              ist auf die angegebene Altersgruppe beschränkt.
            </p>
            <p>
              Plätze werden in der Reihenfolge der vollständig eingegangenen Anmeldungen vergeben.
              Bei ausgebuchten Camps besteht die Möglichkeit, sich auf die Warteliste setzen zu
              lassen.
            </p>
          </section>

          <section id="tb-3">
            <h2>3. Zahlung</h2>
            <p>
              Der Teilnahmebetrag ist nach Erhalt der Anmeldebestätigung fällig. Zahlungsdetails
              werden in der Bestätigungsmail mitgeteilt. Bei Nichtzahlung innerhalb der angegebenen
              Frist kann der Platz anderweitig vergeben werden.
            </p>
          </section>

          <section id="tb-4">
            <h2>4. Rücktritt und Stornierung</h2>
            <p>
              Ein Rücktritt ist schriftlich per E-Mail an {entityName} zu erklären. Bei Rücktritt
              bis 4 Wochen vor Camp-Beginn wird der Teilnahmebetrag abzüglich einer
              Bearbeitungsgebühr von 20 € erstattet. Bei späterem Rücktritt oder Nichterscheinen
              wird der volle Betrag einbehalten, sofern kein Ersatzteilnehmer gestellt werden kann.
            </p>
            <p>
              Bei Absage eines Camps durch {entityName} wird der vollständige Teilnahmebetrag
              erstattet. Weitergehende Ansprüche bestehen nicht.
            </p>
          </section>

          <section id="tb-5">
            <h2>5. Haftung und Verhalten</h2>
            <p>
              {entityName} haftet nicht für Schäden an mitgebrachten Gegenständen. Die Teilnehmer
              sind verpflichtet, die Anweisungen der Trainer zu befolgen und respektvoll mit allen
              Beteiligten umzugehen. Bei wiederholten schwerwiegenden Verstößen kann ein
              Teilnehmer vom Camp ausgeschlossen werden, ohne dass ein Anspruch auf Erstattung
              besteht.
            </p>
            <p>
              Gesetzliche Vertreter versichern mit der Anmeldung, dass keine gesundheitlichen
              Einschränkungen bestehen, die einer Teilnahme entgegenstehen, sofern diese nicht
              im Anmeldeformular angegeben wurden.
            </p>
          </section>
        </div>
      </main>
    </LegalShell>
  )
}
