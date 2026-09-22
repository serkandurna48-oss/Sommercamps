import { de } from '../../../lib/i18n/de'

/** Abschnitt 1: "nur die Navigation dorthin wird gebaut, die Inhalte
 * nicht" — für Zahlungen/Warteliste/Aufgaben/Konfiguration. Ehrlicher
 * Platzhalter statt eines toten oder deaktivierten Tabs. */
export default function ComingSoon() {
  return (
    <main className="mx-auto max-w-[920px] px-4 py-16 pb-24 text-center md:px-8 md:pb-16 xl:px-6">
      <p className="cp-title" style={{ color: 'var(--cp-ink)' }}>
        {de.comingSoon.title}
      </p>
      <p className="cp-body mx-auto mt-2 max-w-md" style={{ color: 'var(--cp-muted)' }}>
        {de.comingSoon.body}
      </p>
    </main>
  )
}
