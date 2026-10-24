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
  const [pathname, query] = href.split('?')
  const path = pathname.split('/').slice(3)
  const params = new URLSearchParams()
  const sourceParams = new URLSearchParams(query)
  for (const key of ['filter', 'sort', 'schritt']) {
    const value = sourceParams.get(key)
    if (value) params.set(key, value)
  }
  let screen = path[0] || 'dashboard'
  if (path[0] === 'camps') {
    screen = path[1] === 'new' ? 'camp-neu' : path[2] ? `camp-${path[2]}` : 'camp'
    if (!empty && path[1] !== 'new') params.set('camp', path[1])
  } else if (path[0] === 'einrichtung') {
    const schritt = sourceParams.get('schritt')
    screen = schritt ? `einrichtung-${schritt}` : 'einrichtung-1'
    params.delete('schritt')
  }
  if (empty) params.set('leer', '1')
  const search = params.toString()
  return `/dev/admin-vorschau/${screen}${search ? `?${search}` : ''}`
}
