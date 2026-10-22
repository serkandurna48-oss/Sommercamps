import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import { orgTabs } from '../navTabs'
import { de } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'

export default function HilfeScreen({ orgSlug, org }: OrganizationIdentityProps) {
  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.hilfe.title}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />
      <main
        className="mx-auto max-w-[920px] space-y-10 px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6"
        style={{ color: 'var(--cp-ink)' }}
      >
        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s1}</h2>
          <p className="cp-body mb-2" style={{ color: 'var(--cp-ink-2)' }}>
            Beim ersten Start zeigt das Dashboard eine Startkarte mit drei Schritten.
          </p>
          <ol className="cp-body list-decimal space-y-1 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            <li>Kontakt-E-Mail, Anschrift und Teilnahmebedingungen eintragen</li>
            <li>Erstes Camp anlegen</li>
            <li>Vereinsseite und Camp veröffentlichen</li>
          </ol>
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>
            Jeder Schritt enthält einen direkten Link zur passenden Seite. Sobald alles veröffentlicht ist, verschwindet die Startkarte.
          </p>
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s2}</h2>
          <ol className="cp-body list-decimal space-y-2 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            <li>{`Im Dashboard auf „+ Camp anlegen" klicken`}</li>
            <li>Titel, Termin, Kapazität und Preis eintragen, dann speichern</li>
            <li>{`Im Camp → Tab „Einstellungen" → Status auf „Veröffentlicht" setzen`}</li>
            <li>{`In „Vereinseinstellungen" → „Seite veröffentlichen" aktivieren`}</li>
          </ol>
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>Fertig – deine Anmeldeseite ist live.</p>
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s3}</h2>
          <p className="cp-body mb-1" style={{ color: 'var(--cp-ink-2)' }}>
            Dein Anmeldelink: <code className="cp-label">/pilot/{orgSlug}</code>
          </p>
          <p className="cp-body mb-4" style={{ color: 'var(--cp-ink-2)' }}>
            Den vollständigen Link (mit Domain) siehst du auf dem Dashboard. Kopiere ihn von dort direkt in deine Nachricht.
          </p>
          <h3 className="cp-subheading mb-2" style={{ color: 'var(--cp-ink)' }}>WhatsApp-Vorlage</h3>
          <textarea
            readOnly
            rows={6}
            defaultValue={de.hilfe.whatsappTemplate(orgSlug)}
            className="cp-body w-full rounded border p-3 font-[inherit]"
            style={{
              borderColor: 'var(--cp-field-line)',
              background: 'var(--cp-surface-2)',
              color: 'var(--cp-ink)',
              resize: 'vertical',
            }}
          />
          <h3 className="cp-subheading mb-2 mt-4" style={{ color: 'var(--cp-ink)' }}>Instagram / Facebook</h3>
          <textarea
            readOnly
            rows={3}
            defaultValue={de.hilfe.instagramTemplate(orgSlug)}
            className="cp-body w-full rounded border p-3 font-[inherit]"
            style={{
              borderColor: 'var(--cp-field-line)',
              background: 'var(--cp-surface-2)',
              color: 'var(--cp-ink)',
              resize: 'vertical',
            }}
          />
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s4}</h2>
          <p className="cp-body mb-2" style={{ color: 'var(--cp-ink-2)' }}>
            Jede Anmeldung erhält automatisch eine CP-Referenz (z. B. <code className="cp-label">CP-ABC12345</code>).
            Das ist der Verwendungszweck, den die Eltern bei der Überweisung angeben.
          </p>
          <ol className="cp-body list-decimal space-y-1 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            <li>{`Geh zur Seite „Zahlungen"`}</li>
            <li>Suche die Anmeldung anhand der CP-Referenz oder des Namens</li>
            <li>{`Sobald die Überweisung auf deinem Konto eingegangen ist, klick auf „Als bezahlt markieren"`}</li>
          </ol>
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s5}</h2>
          <ul className="cp-body list-disc space-y-2 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            <li>Wenn ein Camp voll ist, landen neue Anmeldungen automatisch auf der Warteliste.</li>
            <li>Bei einer Stornierung rückt das nächste Kind auf der Warteliste automatisch nach – keine manuelle Aktion nötig.</li>
            <li>Der Verein informiert die Eltern selbst über das Nachrücken. Es gibt keine automatische Benachrichtigung.</li>
            <li>{`Stornieren: Camp → Teilnehmerliste → Anmeldung öffnen → „Stornieren"`}</li>
          </ul>
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s6}</h2>
          <ol className="cp-body list-decimal space-y-1 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            <li>{`Geh zum Camp → Tab „Teilnehmer"`}</li>
            <li>{`Klick auf „Exportieren" → „Tagesliste herunterladen"`}</li>
          </ol>
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>
            Die Liste enthält alle aktiven Teilnehmer ohne Warteliste und Stornierungen.
          </p>
        </section>

        <section>
          <h2 className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{de.hilfe.s7}</h2>
          <p className="cp-body mb-4" style={{ color: 'var(--cp-ink-2)' }}>
            Kurze Antworten, die du an Eltern weitergeben kannst.
          </p>
          <dl className="space-y-5">
            {de.hilfe.faq.map(({ q, a }) => (
              <div key={q}>
                <dt className="cp-subheading mb-1" style={{ color: 'var(--cp-ink)' }}>{q}</dt>
                <dd className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  )
}
