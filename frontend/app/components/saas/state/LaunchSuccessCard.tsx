'use client'

import { useState } from 'react'
import { de } from '../../../lib/i18n/de'
import Button, { ButtonLink } from '../ui/Button'
import SuccessNote from './SuccessNote'
import { useAdminPreview } from '../preview/AdminPreviewContext'

export default function LaunchSuccessCard({ orgSlug, brandStrong, brandOn }: {
  orgSlug: string
  brandStrong: string
  brandOn: string
}) {
  const [copyResult, setCopyResult] = useState<'idle' | 'copied' | 'error'>('idle')
  const preview = useAdminPreview()
  const registrationLink = preview ? '/dev/admin-vorschau' : `/pilot/${orgSlug}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(registrationLink, window.location.origin).href)
      setCopyResult('copied')
    } catch {
      setCopyResult('error')
    }
  }

  return (
    <div className="cp-card" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
      <SuccessNote>{de.onboarding.liveLabel}</SuccessNote>
      <p className="cp-body mt-2">{de.onboarding.liveShareHint}</p>
      <p className="cp-body mt-2 break-all" style={{ color: 'var(--cp-ink-2)' }}>/pilot/{orgSlug}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="primary" brandStrong={brandStrong} brandOn={brandOn} onClick={copyLink}>
          {de.onboarding.liveCopyLink}
        </Button>
        <ButtonLink href={registrationLink} variant="secondary">
          {de.onboarding.liveOpen}
        </ButtonLink>
      </div>
      {copyResult === 'copied' && <p role="status" className="cp-body mt-2">{de.onboarding.liveCopied}</p>}
      {copyResult === 'error' && <p role="alert" className="cp-body mt-2">{de.onboarding.liveCopyError}</p>}
    </div>
  )
}
