import SentryTestButton from './SentryTestButton'

export const metadata = { title: 'Fehlerüberwachung testen', robots: { index: false, follow: false } }

/** Platform owners only (gate: ../../layout.tsx). Nested under audit-log so
 * the path can never collide with an organization slug at /platform/[org]. */
export default function SentryTestPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-4 py-8 md:px-6">
      <h1 className="text-xl font-semibold">Fehlerüberwachung testen</h1>
      <p className="mt-2 max-w-prose text-sm">
        Löst einen absichtlichen Fehler im Browser aus. Er enthält keine Daten und muss kurz darauf in Sentry
        im Projekt des Frontends erscheinen.
      </p>
      <SentryTestButton />
    </main>
  )
}
