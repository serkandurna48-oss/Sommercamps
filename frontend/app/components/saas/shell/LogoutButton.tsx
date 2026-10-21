'use client'

import { useAdminPreview, previewLogoutAction } from '../preview/AdminPreviewContext'
import { logoutAction } from './logoutAction'

export default function LogoutButton({ orgSlug }: { orgSlug: string }) {
  const preview = useAdminPreview()
  return (
    <form action={preview ? previewLogoutAction : logoutAction.bind(null, orgSlug)}>
      <button
        type="submit"
        className="cp-focus min-h-[44px] min-w-[44px] cp-label rounded-[var(--cp-r-chip)] border px-3 py-1.5"
        style={{ color: 'var(--cp-on-band-2)', borderColor: 'var(--cp-band-line)' }}
      >
        Abmelden
      </button>
    </form>
  )
}
