import Link from 'next/link'
import NewOrgForm from './NewOrgForm'

export default function NewOrganizationPage() {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      <Link href="/platform" className="cp-chip mb-4 inline-block" style={{ color: 'var(--cp-muted)' }}>
        ← Alle Vereine
      </Link>
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
        Neuen Verein anlegen
      </h1>
      <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
        Verein und ein erstes Camp in einem Schritt — direkt startklar für Eltern-Anmeldungen.
      </p>
      <NewOrgForm />
    </main>
  )
}
