import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import EinrichtungScreen from '../../../../components/saas/screens/EinrichtungScreen'

type Props = {
  params: Promise<{ org: string }>
  searchParams?: Promise<{ schritt?: string | string[] }>
}

export default async function EinrichtungPage({ params, searchParams }: Props) {
  const { org: orgSlug } = await params
  const query = await searchParams
  const schritt = typeof query?.schritt === 'string' ? parseInt(query.schritt, 10) : undefined

  const { org, camps } = await loadOrgAdminData(orgSlug)

  return (
    <EinrichtungScreen
      key={schritt ?? 'auto'}
      orgSlug={orgSlug}
      org={org}
      camps={camps}
      requestedStep={schritt}
    />
  )
}
