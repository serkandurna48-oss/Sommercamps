import { loadCampAdminData } from '../../../../../components/saas/orgAdminData'
import CampDetailScreen from '../../../../../components/saas/screens/CampDetailScreen'

export default async function CampCommandCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; campSlug: string }>
  searchParams?: Promise<{ filter?: string | string[]; sort?: string | string[] }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

  const query = await searchParams
  const initialFilter = query?.filter === 'missing-info' || query?.filter === 'payment-open' ? query.filter : 'all'
  const initialSort = query?.sort === 'name' ? 'name' : 'newest'

  return <CampDetailScreen initialFilter={initialFilter} initialSort={initialSort} orgSlug={orgSlug} campSlug={campSlug} org={org} camp={camp} registrations={registrations} />
}
