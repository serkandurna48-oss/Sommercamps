import { computeBrandSafe } from '../../../lib/brandPipeline'
import { fetchOrganization } from '../../../lib/saasApi'
import LoginForm from './LoginForm'

/** Shared organization branding for login and account recovery. */
export default async function AuthPage({ orgSlug, children }: { orgSlug: string; children?: React.ReactNode }) {
  let org
  try {
    org = await fetchOrganization(orgSlug)
  } catch {
    // Authentication remains available while the organization API is unavailable.
  }
  // Sign-in pages always sit on the white product surface, whatever the public theme.
  const brand = org ? computeBrandSafe(org.primary_color, '#FFFFFF') : undefined
  return (
    <LoginForm orgSlug={orgSlug} orgName={org?.name} orgLogoUrl={org?.logo_url}
      brandStrong={brand?.strong} brandOn={brand?.on}>
      {children}
    </LoginForm>
  )
}
