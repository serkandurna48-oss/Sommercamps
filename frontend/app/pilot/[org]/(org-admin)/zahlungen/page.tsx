import { loadOrgPaymentsData } from '../../../../components/saas/orgAdminData'
import OrgPaymentsScreen from '../../../../components/saas/screens/OrgPaymentsScreen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Zahlungen' }

export default async function OrgPaymentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp, trainingPayments, trainingPaymentsError } = await loadOrgPaymentsData(orgSlug)

  return <OrgPaymentsScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} trainingPayments={trainingPayments} trainingPaymentsError={trainingPaymentsError} />
}
