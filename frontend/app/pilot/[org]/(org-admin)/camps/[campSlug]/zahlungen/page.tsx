import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import CampPaymentsScreen from '../../../../../../components/saas/screens/CampPaymentsScreen'

export default async function CampPaymentsPage({ params, searchParams }: { params: Promise<{ org: string; campSlug: string }>; searchParams?: Promise<{ filter?: string | string[] }> }) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)
  const query = await searchParams
  const initialFilter = query?.filter === 'paid' || query?.filter === 'all' ? query.filter : 'open'
  return <CampPaymentsScreen orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} initialFilter={initialFilter} />
}
