import Image from 'next/image'
import { notFound } from 'next/navigation'
import { fetchCamps, fetchOrganization } from '../../lib/saasApi'
import { accentContrast, FALLBACK_ACCENT, INK, MUTED, PAPER } from '../theme'
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
  const accent = org.primary_color ?? FALLBACK_ACCENT
  const onAccent = accentContrast(accent)
  const initial = org.name.trim().charAt(0).toUpperCase()

  return (
    <main className="min-h-screen" style={{ backgroundColor: PAPER }}>
      <div className="mx-auto max-w-xl px-6 py-14">
        <header className="flex items-start gap-4">
          <span
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{ backgroundColor: accent }}
          >
            {org.logo_url ? (
              <Image src={org.logo_url} alt={org.name} fill unoptimized className="object-contain p-1.5" />
            ) : (
              <span
                className="text-2xl font-semibold [font-family:var(--font-pilot-display)]"
                style={{ color: onAccent }}
              >
                {initial}
              </span>
            )}
          </span>

          <div className="min-w-0">
            <p className="text-xs" style={{ color: MUTED }}>
              CampsPilot
            </p>
            <h1
              className="text-3xl leading-tight font-semibold [font-family:var(--font-pilot-display)]"
              style={{ color: INK }}
            >
              {org.name}
            </h1>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              {org.contact_email}
            </p>
          </div>
        </header>

        <p className="mt-8 border-t pt-4 text-xs leading-relaxed" style={{ borderColor: MUTED + '33', color: MUTED }}>
          Pilotbetrieb: Anmeldungen werden gespeichert, es geht aber noch keine Bestätigungsmail
          und keine Zahlung raus.
        </p>

        <div className="mt-8">
          <PilotFlow org={org} camps={camps} accent={accent} onAccent={onAccent} />
        </div>
      </div>
    </main>
  )
}
