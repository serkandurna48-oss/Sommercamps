import { loadOrgPaymentsData } from '../../../../components/saas/orgAdminData'
import { isModuleDisabled } from '../../../../components/saas/trainingAdminData'
import OrgPaymentsScreen from '../../../../components/saas/screens/OrgPaymentsScreen'
import { fetchInvoicesAdmin } from '../../../../lib/saasAdminApi'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Zahlungen' }

export default async function OrgPaymentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  // Organisation is cached per request (layout): without the trainings module no training-payments request.
  const trainings = !(await isModuleDisabled(orgSlug, 'trainings'))
  const { org, camps, registrationsByCamp, trainingPayments, trainingPaymentsError, token } = await loadOrgPaymentsData(orgSlug, { trainings })
  // Invoices must never break the payments page.
  const invoices = await fetchInvoicesAdmin(orgSlug, token).catch(() => null)

  return <OrgPaymentsScreen orgSlug={orgSlug} org={org} camps={camps} registrationsByCamp={registrationsByCamp} trainingPayments={trainingPayments} trainingPaymentsError={trainingPaymentsError} invoices={invoices} />
}
