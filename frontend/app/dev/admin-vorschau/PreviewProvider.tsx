'use client'

import { AdminPreviewContext } from '../../components/saas/preview/AdminPreviewContext'

export default function PreviewProvider({ empty, basePath, parentHref, children }: { empty: boolean; basePath?: string; parentHref?: string; children: React.ReactNode }) {
  return <AdminPreviewContext.Provider value={{ empty, basePath, parentHref }}>{children}</AdminPreviewContext.Provider>
}
