'use client'

import { createContext, useContext } from 'react'

export const AdminPreviewContext = createContext<{ empty: boolean } | null>(null)

export function useAdminPreview() {
  return useContext(AdminPreviewContext)
}

/** Local actions never authenticate, mutate, revalidate or redirect. */
export async function previewNoopAction<S extends { error: string | null }>(state: S, _data?: FormData): Promise<S> {
  void _data
  return { ...state, error: 'Vorschau – Änderungen werden nicht gespeichert.' }
}

export async function previewLogoutAction() {}

export function previewHref(href: string, empty: boolean): string {
  if (!href.startsWith('/pilot/')) return href
  const path = href.split('?')[0].split('/').slice(3)
  let screen = path[0] || 'dashboard'
  if (path[0] === 'camps') {
    screen = path[1] === 'new' ? 'camp-neu' : path[2] === 'konfiguration' ? 'camp-konfiguration' : path[2] || 'camp'
  }
  return `/dev/admin-vorschau/${screen}${empty ? '?leer=1' : ''}`
}
