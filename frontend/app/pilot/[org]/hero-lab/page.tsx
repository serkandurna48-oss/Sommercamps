import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { computeBrandSafe } from '../../../lib/brandPipeline'
import { fetchCamps, fetchOrganization } from '../../../lib/saasApi'
import { publicFontClassName } from '../publicFonts'
import HeroLab from './HeroLab'
import './heroLab.css'
import '../publicTheme.css'

export const metadata: Metadata = { robots: { index: false } }

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

export default async function HeroLabPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ v?: string }>
}) {
  const { org: orgSlug } = await params
  const { v } = await searchParams

  const [orgOutcome, campsOutcome] = await Promise.allSettled([
    fetchOrganization(orgSlug),
    fetchCamps(orgSlug),
  ])

  if (orgOutcome.status === 'rejected') throw orgOutcome.reason
  const org = orgOutcome.value
  if (!org) notFound()
  if (campsOutcome.status === 'rejected') throw campsOutcome.reason
  const camps = campsOutcome.value

  const ground = THEME_SURFACE[org.theme] ?? THEME_SURFACE.tradition
  const brand = computeBrandSafe(org.primary_color, ground)
  const variant: 1 | 2 | 3 | undefined =
    v === '1' ? 1 : v === '2' ? 2 : v === '3' ? 3 : undefined

  return (
    <div
      className={`cp-public ${publicFontClassName(org.theme)}`}
      data-theme={org.theme}
      style={
        {
          '--brand': brand.brand,
          '--brand-strong': brand.strong,
          '--brand-on': brand.on,
        } as React.CSSProperties
      }
    >
      <HeroLab org={org} camps={camps} variant={variant} />
    </div>
  )
}
