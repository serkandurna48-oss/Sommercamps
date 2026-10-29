import { computeBrandSafe } from '../../../lib/brandPipeline'
import { fetchOrganization } from '../../../lib/saasApi'
import LoginForm from './LoginForm'

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

/** Shared organization branding for login and account recovery. */
export default async function AuthPage({ orgSlug, children }: { orgSlug: string; children?: React.ReactNode }) {
  let org
  try {
    org = await fetchOrganization(orgSlug)
  } catch {
    // Authentication remains available while the organization API is unavailable.
  }
  const brand = org ? computeBrandSafe(org.primary_color, THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition) : undefined
  return (
    <LoginForm orgSlug={orgSlug} orgName={org?.name} orgLogoUrl={org?.logo_url}
      orgTheme={org?.theme} brandStrong={brand?.strong} brandOn={brand?.on}>
      {children}
    </LoginForm>
  )
}
