'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Per-browser sidebar preferences (collapsed rail, closed groups). Stored in
 * localStorage, which can throw or be empty (private mode, blocked storage),
 * so every access is guarded and the UI falls back to the expanded default.
 */
export const SIDEBAR_STORAGE_KEY = 'cp-admin-sidebar'
const CHANGE_EVENT = 'cp-admin-sidebar-change'

export interface SidebarPrefs {
  collapsed: boolean
  closedGroups: string[]
}

const DEFAULT_PREFS: SidebarPrefs = { collapsed: false, closedGroups: [] }

export function parseSidebarPrefs(raw: string | null): SidebarPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const value = JSON.parse(raw) as Partial<SidebarPrefs>
    return {
      collapsed: value.collapsed === true,
      closedGroups: Array.isArray(value.closedGroups) ? value.closedGroups.filter((g): g is string => typeof g === 'string') : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

// Fallback for this page view when storage is blocked: the toggle still works, it is just not remembered.
let memoryRaw: string | null = null

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? memoryRaw
  } catch {
    return memoryRaw
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function useSidebarPrefs(): [SidebarPrefs, (next: SidebarPrefs) => void] {
  // Server and first client render use the default (expanded) layout.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  const prefs = parseSidebarPrefs(raw)
  const update = useCallback((next: SidebarPrefs) => {
    memoryRaw = JSON.stringify(next)
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, memoryRaw)
    } catch {
      // Storage unavailable: the change simply is not remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [prefs, update]
}
