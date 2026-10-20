import type { Metadata } from 'next'
import { computeBrandSafe } from '../../../lib/brandPipeline'
import { fetchOrganization } from '../../../lib/saasApi'
import LoginForm from './LoginForm'

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Anmelden – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function AdminLoginPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params

  let orgName: string | undefined
  let orgLogoUrl: string | null | undefined
  let orgTheme: 'tradition' | 'akademie' | 'kompakt' = 'tradition'
  let brandStrong: string | undefined
  let brandOn: string | undefined

  try {
    const org = await fetchOrganization(orgSlug)
    if (org) {
      orgName = org.name
      orgLogoUrl = org.logo_url
      orgTheme = org.theme
      const ground = THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition
      const brand = computeBrandSafe(org.primary_color, ground)
      brandStrong = brand.strong
      brandOn = brand.on
    }
  } catch {
    // fall through with defaults if backend is unavailable
  }

  return (
    <LoginForm
      orgSlug={orgSlug}
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
      orgTheme={orgTheme}
      brandStrong={brandStrong}
      brandOn={brandOn}
    />
  )
}
