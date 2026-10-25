'use client'

import { useState } from 'react'
import { de } from '../../../lib/i18n/de'
import Button, { ButtonLink } from '../ui/Button'
import { useAdminPreview } from '../preview/AdminPreviewContext'

export default function ParentLinkActions({ orgSlug }: { orgSlug: string }) {
  const [result, setResult] = useState<'copied' | 'error' | null>(null)
  const preview = useAdminPreview()
  const href = preview ? '/dev/admin-vorschau' : `/pilot/${orgSlug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href)
      setResult('copied')
    } catch {
      setResult('error')
    }
  }

  return (
    <div className="cp-body flex flex-col items-start gap-3">
      <p>{de.onboarding.liveShareHint}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={copy}>{de.onboarding.liveCopyLink}</Button>
        <ButtonLink href={href} variant="secondary">{de.onboarding.liveOpen}</ButtonLink>
      </div>
      {result === 'copied' && <p role="status">{de.onboarding.liveCopied}</p>}
      {result === 'error' && <p role="alert">{de.onboarding.liveCopyError}</p>}
    </div>
  )
}
