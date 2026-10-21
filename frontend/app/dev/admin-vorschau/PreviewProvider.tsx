'use client'

import { AdminPreviewContext } from '../../components/saas/preview/AdminPreviewContext'

export default function PreviewProvider({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  return <AdminPreviewContext.Provider value={{ empty }}>{children}</AdminPreviewContext.Provider>
}
