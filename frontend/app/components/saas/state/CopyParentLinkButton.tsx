'use client'

import { useState } from 'react'
import { de } from '../../../lib/i18n/de'
import { IconLink } from '../icons'
import { previewParentHref, useAdminPreview } from '../preview/AdminPreviewContext'
import Button, { type ButtonVariant } from '../ui/Button'

/** Quick action "Link teilen": copies the parent registration page URL. */
export default function CopyParentLinkButton({ orgSlug, variant = 'secondary', label = 'Anmeldelink kopieren' }: {
  orgSlug: string
  variant?: ButtonVariant
  label?: string
}) {
  const [result, setResult] = useState<'copied' | 'error' | null>(null)
  const preview = useAdminPreview()
  const href = preview ? previewParentHref(preview) : `/pilot/${orgSlug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href)
      setResult('copied')
    } catch {
      setResult('error')
    }
  }

  return (
    <span className="relative inline-flex">
      <Button type="button" variant={variant} onClick={copy} className="w-full">
        <IconLink size={16} />
        {result === 'copied' ? 'Link kopiert' : label}
      </Button>
      <span role="status" className="sr-only">{result === 'copied' ? de.onboarding.liveCopied : ''}</span>
      {result === 'error' && (
        <span role="alert" className="cp-hint absolute top-full left-0 mt-1 whitespace-nowrap">{de.onboarding.liveCopyError}</span>
      )}
    </span>
  )
}
