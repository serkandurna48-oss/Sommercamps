import type { CSSProperties } from 'react'
import type { OrganizationPublic } from '../../lib/saasApi'
import { computeBrandSafe } from '../../lib/brandPipeline'
import PublicState from './PublicState'
import RetryButton from './RetryButton'
import { publicFontClassName } from './publicFonts'

export default function PublicLoadError({ org }: { org?: OrganizationPublic }) {
  const theme = org?.theme ?? 'kompakt'
  const brand = computeBrandSafe(org?.primary_color ?? null, theme === 'akademie' ? '#161C1A' : '#FFFFFF')
  return <main className={`cp-public public-state-page ${publicFontClassName(theme)}`} data-theme={theme}
    style={{ '--brand': brand.brand, '--brand-strong': brand.strong, '--brand-on': brand.on } as CSSProperties}>
    <PublicState org={org} title="Camps gerade nicht erreichbar"
      message="Die Camp-Informationen konnten nicht geladen werden."
      instruction="Bitte versuchen Sie es in einem Moment erneut.">
      <RetryButton />
    </PublicState>
  </main>
}
