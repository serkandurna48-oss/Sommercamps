import { ImageResponse } from 'next/og'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { readableTextOn } from '../../lib/readableTextOn'
import { fetchOrganization } from '../../lib/saasApi'
import { getClubAssets } from './clubAssets'
import { getSiteUrl } from './socialMetadata'

export const alt = 'Fußballcamps'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const org = await fetchOrganization(slug).catch(() => null)
  const name = org?.name ?? 'CampsPilot'
  const brand = computeBrandSafe(org?.primary_color, '#FFFFFF').brand
  const logo = org && (org.logo_url || getClubAssets(org.slug)?.logoImage)
  const logoUrl = logo ? new URL(logo, await getSiteUrl()).href : null

  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#FFFFFF', color: '#111111' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '48px 64px 24px' }}>
        <div style={{ display: 'flex', fontSize: 28 }}>CampsPilot</div>
        {/* ImageResponse renders plain image elements, without next/image. */}
        {logoUrl && <img src={logoUrl} alt="Vereinslogo" width={120} height={120} style={{ objectFit: 'contain' }} />}
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '0 64px 40px', fontSize: name.length > 45 ? 56 : 76, fontWeight: 700, lineHeight: 1.1, overflowWrap: 'break-word' }}>
        {name}
      </div>
      <div style={{ display: 'flex', background: brand, color: readableTextOn(brand), padding: '36px 64px', fontSize: 44, fontWeight: 700 }}>
        Fußballcamps
      </div>
    </div>,
    size,
  )
}
