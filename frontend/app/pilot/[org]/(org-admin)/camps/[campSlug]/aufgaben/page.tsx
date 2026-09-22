import { CampStubScreen } from '../../../../../../components/saas/stubScreens'

export default async function Page({ params }: { params: Promise<{ org: string; campSlug: string }> }) {
  const { org, campSlug } = await params
  return <CampStubScreen orgSlug={org} campSlug={campSlug} />
}
