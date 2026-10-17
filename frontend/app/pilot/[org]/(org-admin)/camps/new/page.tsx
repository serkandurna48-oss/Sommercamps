import { notFound, redirect } from 'next/navigation'
import { computeBrandTokens } from '../../../../../components/saas/brandPipeline'
import CampCreateForm from '../../../../../components/saas/config/CampCreateForm'
import MatchdayBand from '../../../../../components/saas/shell/MatchdayBand'
import { orgTabs } from '../../../../../components/saas/navTabs'
import { getAdminToken } from '../../../../../lib/adminSession'
import { fetchOrganizationAdmin } from '../../../../../lib/saasAdminApi'

export default async function NewCampPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title="Neues Camp"
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          Camp anlegen
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          Weitere Angaben (Ort, Betreuung, Leistungen) lassen sich danach in der Camp-Konfiguration ergänzen.
        </p>

        <CampCreateForm orgSlug={orgSlug} />
      </main>
    </>
  )
}
