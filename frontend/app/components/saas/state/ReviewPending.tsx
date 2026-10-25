'use client'

import { de } from '../../../lib/i18n/de'
import { ButtonLink } from '../ui/Button'
import { previewHref, useAdminPreview } from '../preview/AdminPreviewContext'

export default function ReviewPending({ orgSlug }: { orgSlug: string }) {
  const preview = useAdminPreview()
  const statusHref = `/pilot/${orgSlug}/einrichtung?schritt=4`
  return (
    <div className="cp-body flex flex-col items-start gap-3">
      <p role="status">{de.onboarding.reviewPendingBanner}</p>
      <p>{de.onboarding.reviewPendingHint}</p>
      {/* A full navigation also reloads the status when this is the current route. */}
      <a href={preview ? previewHref(statusHref, preview.empty) : statusHref} className="cp-focus inline-flex min-h-[44px] items-center underline">
        {de.onboarding.reviewRefresh}
      </a>
      <ButtonLink href={`/pilot/${orgSlug}/hilfe`} variant="secondary">{de.onboarding.reviewHelp}</ButtonLink>
    </div>
  )
}
