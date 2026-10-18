import { notFound, redirect } from 'next/navigation'
import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import OrganizationConfigForm from '../../../../components/saas/config/OrganizationConfigForm'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import { orgTabs } from '../../../../components/saas/navTabs'
import { de } from '../../../../lib/i18n/de'
import { getAdminToken } from '../../../../lib/adminSession'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'

/** Lädt bewusst NICHT über loadOrgAdminData — diese Seite braucht keine
 * Camps/Registrierungen, nur die Organisation selbst. Nutzt seit dem
 * Betreiber-Builder die ADMIN-Sicht (getOrganizationAdmin), nicht mehr
 * die öffentliche fetchOrganization: Abrechnungs-Notizen und der
 * Veröffentlichen-Schalter sind ausschließlich in der Admin-Sicht verfügbar. */
export default async function OrgConfigPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.command.configuration}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.orgHeading}
        </h2>
        <p className="cp-body mb-8" style={{ color: 'var(--cp-muted)' }}>
          {de.configPage.orgHint}
        </p>

        <OrganizationConfigForm orgSlug={orgSlug} org={org} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
      </main>
    </>
  )
}
