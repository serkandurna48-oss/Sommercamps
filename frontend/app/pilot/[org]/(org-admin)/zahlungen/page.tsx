import { OrgStubScreen } from '../../../../components/saas/stubScreens'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return <OrgStubScreen orgSlug={org} />
}
