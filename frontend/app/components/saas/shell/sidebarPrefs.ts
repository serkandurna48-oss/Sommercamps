/**
 * Sidebar preferences shared by server and client. The same JSON lives in
 * localStorage (source of truth per browser) and in a cookie mirror, so the
 * server can render the collapsed rail directly instead of the expanded
 * sidebar flashing until hydration. The cookie holds only UI state.
 */
export const SIDEBAR_STORAGE_KEY = 'cp-admin-sidebar'
export const SIDEBAR_COOKIE = 'cp-admin-sidebar'

export interface SidebarPrefs {
  collapsed: boolean
  closedGroups: string[]
}

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { collapsed: false, closedGroups: [] }

export function parseSidebarPrefs(raw: string | null | undefined): SidebarPrefs {
  if (!raw) return DEFAULT_SIDEBAR_PREFS
  try {
    const value = JSON.parse(raw) as Partial<SidebarPrefs>
    return {
      collapsed: value.collapsed === true,
      closedGroups: Array.isArray(value.closedGroups) ? value.closedGroups.filter((g): g is string => typeof g === 'string').slice(0, 20) : [],
    }
  } catch {
    return DEFAULT_SIDEBAR_PREFS
  }
}

/** Normalised JSON for storage and cookie (unknown fields dropped, bounded size). */
export function serializeSidebarPrefs(prefs: SidebarPrefs): string {
  const { collapsed, closedGroups } = parseSidebarPrefs(JSON.stringify(prefs))
  return JSON.stringify({ collapsed, closedGroups })
}
