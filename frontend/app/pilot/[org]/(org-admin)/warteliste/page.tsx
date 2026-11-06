import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import OrgWaitlistScreen from '../../../../components/saas/screens/OrgWaitlistScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Warteliste' }

export default async function OrgWaitlistPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  return <OrgWaitlistScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} />
}
