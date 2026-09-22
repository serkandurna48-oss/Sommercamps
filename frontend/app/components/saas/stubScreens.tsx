import { notFound, redirect } from 'next/navigation'
import { computeBrandTokens } from './brandPipeline'
import { orgTabs, campTabs } from './navTabs'
import MatchdayBand from './shell/MatchdayBand'
import ComingSoon from './state/ComingSoon'
import { getAdminToken } from '../../lib/adminSession'
import { AdminAuthError, fetchCampsAdmin } from '../../lib/saasAdminApi'
import { fetchOrganization } from '../../lib/saasApi'

/** Gemeinsame Bestandsaufnahme für die neun ComingSoon-Routen (Abschnitt 1:
 * Navigation existiert, Inhalt nicht) — Band + Tabs bleiben real, damit man
 * von dort aus weiternavigieren kann. */
export async function OrgStubScreen({ orgSlug }: { orgSlug: string }) {
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganization(orgSlug)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={org.name}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />
      <ComingSoon />
    </>
  )
}

export async function CampStubScreen({ orgSlug, campSlug }: { orgSlug: string; campSlug: string }) {
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganization(orgSlug)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  let camps
  try {
    camps = await fetchCampsAdmin(orgSlug, token)
  } catch (err) {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  }
  const camp = camps.find(c => c.slug === campSlug)
  if (!camp) notFound()

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />
      <ComingSoon />
    </>
  )
}
