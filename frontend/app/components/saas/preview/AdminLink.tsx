'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { previewHref, useAdminPreview } from './AdminPreviewContext'

/** Keep both navigation and Next's prefetch inside the offline preview. */
export default function AdminLink({ href, ...props }: ComponentProps<typeof Link>) {
  const preview = useAdminPreview()
  return <Link {...props} href={preview && typeof href === 'string' ? previewHref(href, preview.empty) : href} />
}
