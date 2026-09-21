import { notFound } from 'next/navigation'
import { fetchCamps, fetchOrganization } from '../../lib/saasApi'
import PilotFlow from './PilotFlow'

/**
 * CP-S408 — isolated CampsPilot SaaS staging pilot flow.
 *
 * Deliberately separate from `/` (KSV/JK legacy flow): different backend
 * (backend_saas via NEXT_PUBLIC_SAAS_API_URL, not NEXT_PUBLIC_API_URL),
 * different data model (see app/lib/saasApi.ts). Does not read or affect
 * clubConfig.tsx, RegistrationForm.tsx, or anything under `/`.
 *
 * `cache: 'no-store'` in saasApi.ts keeps this route fully dynamic — no
 * network access at build time, and always reflects current capacity/
 * waitlist state.
 */
export default async function PilotOrgPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const camps = await fetchCamps(orgSlug)

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        CampsPilot SaaS – Staging Pilot (CP-S408). Testet den Multi-Tenant-Flow gegen die echte
        Cloud-Datenbank. Nur Testdaten, kein Produktivbetrieb.
      </div>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">CampsPilot – {org.name}</h1>
      <PilotFlow org={org} camps={camps} />
    </main>
  )
}
