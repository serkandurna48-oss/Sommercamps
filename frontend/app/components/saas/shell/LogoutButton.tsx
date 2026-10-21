'use client'

import { useAdminPreview, previewLogoutAction } from '../preview/AdminPreviewContext'
import Button from '../ui/Button'
import { logoutAction } from './logoutAction'

export default function LogoutButton({ orgSlug }: { orgSlug: string }) {
  const preview = useAdminPreview()
  return (
    <form action={preview ? previewLogoutAction : logoutAction.bind(null, orgSlug)}>
      <Button type="submit">Abmelden</Button>
    </form>
  )
}
