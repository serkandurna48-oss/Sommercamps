'use client'

import { de } from '../../../lib/i18n/de'
import { isAllowedImageUrl } from '../../../lib/imageUrl'
import { readableTextOn } from '../../../lib/readableTextOn'
import { normalizeHex } from './ColorField'
import '../../../pilot/[org]/publicTheme.css'

export type BrandPreviewTheme = 'tradition' | 'akademie' | 'kompakt'

export function previewTheme(theme: string): BrandPreviewTheme {
  return theme === 'akademie' || theme === 'kompakt' ? theme : 'tradition'
}

export default function BrandPreview({ name, logoUrl, color, theme }: {
  name: string
  logoUrl: string | null
  color: string
  // Omitted in the setup assistant to preserve its original presentation.
  theme?: BrandPreviewTheme
}) {
  const safeLogoUrl = logoUrl && isAllowedImageUrl(logoUrl) ? logoUrl : null
  const normalizedColor = normalizeHex(color)
  return (
    <div
      aria-label={de.einrichtung.previewLabel} data-theme={theme}
      className={`w-full min-w-0 shrink-0 rounded-[var(--cp-r-card)] border p-4 lg:w-56${theme ? ` cp-public brand-preview-${theme}` : ''}`}
      style={{
        borderColor: theme ? 'var(--line)' : 'var(--cp-line)',
        background: theme ? 'var(--surface)' : 'var(--cp-surface)',
        ...(theme ? { paddingBottom: 'var(--state-gap)' } : {}),
      }}
    >
      <p className="cp-chip mb-3" style={{ color: theme ? 'var(--muted)' : 'var(--cp-muted)', ...(theme ? { marginBottom: 'var(--state-gap)' } : {}) }}>{de.einrichtung.previewLabel}</p>
      <div className="flex items-center gap-2">
        {safeLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeLogoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded" style={{ background: normalizedColor || 'var(--cp-line)' }} aria-hidden="true" />
        )}
        <span className="cp-subheading min-w-0" style={{ color: theme ? 'var(--ink)' : 'var(--cp-ink)', overflowWrap: 'anywhere' }}>
          {name || 'Vereinsname'}
        </span>
      </div>
      <div className="mt-3">
        <span
          className={theme ? 'btn primary' : 'cp-label inline-flex min-h-[36px] items-center rounded-[var(--cp-r-field)] px-4 py-2'}
          style={{
            background: normalizedColor || 'var(--cp-ink)',
            color: theme && normalizedColor ? readableTextOn(normalizedColor) : '#fff',
            ...(theme ? { borderColor: normalizedColor || 'var(--cp-ink)' } : {}),
          }}
        >
          {de.einrichtung.previewBtnExample}
        </span>
      </div>
    </div>
  )
}
