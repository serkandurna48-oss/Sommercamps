'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Per-browser sidebar preferences (collapsed rail, closed groups). Stored in
 * localStorage, which can throw or be empty (private mode, blocked storage),
 * so every access is guarded and the UI falls back to the expanded default.
 */
import { SIDEBAR_COOKIE, SIDEBAR_STORAGE_KEY, parseSidebarPrefs, serializeSidebarPrefs, type SidebarPrefs } from './sidebarPrefs'

export { SIDEBAR_STORAGE_KEY, parseSidebarPrefs, type SidebarPrefs }
const CHANGE_EVENT = 'cp-admin-sidebar-change'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function writeCookie(raw: string) {
  try {
    document.cookie = `${SIDEBAR_COOKIE}=${encodeURIComponent(raw)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  } catch {
    // Cookies blocked: the server falls back to the expanded layout.
  }
}

// Fallback for this page view when storage is blocked: the toggle still works, it is just not remembered.
let memoryRaw: string | null = null

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
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

/**
 * `serverRaw` is the cookie mirror the layout read on the server. Server render and
 * hydration use it, so a collapsed rail is collapsed from the first paint. After
 * hydration localStorage wins; without stored prefs the cookie value stays in effect.
 */
export function useSidebarPrefs(serverRaw: string | null = null): [SidebarPrefs, (next: SidebarPrefs) => void] {
  const readRaw = useCallback(() => readStored() ?? serverRaw, [serverRaw])
  const raw = useSyncExternalStore(subscribe, readRaw, () => serverRaw)
  const prefs = parseSidebarPrefs(raw)
  // Older browsers only have localStorage: mirror it once so the next load renders without a flash.
  useEffect(() => {
    const stored = readStored()
    if (stored !== null && stored !== serverRaw) writeCookie(serializeSidebarPrefs(parseSidebarPrefs(stored)))
  }, [serverRaw])
  const update = useCallback((next: SidebarPrefs) => {
    memoryRaw = serializeSidebarPrefs(next)
    writeCookie(memoryRaw)
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, memoryRaw)
    } catch {
      // Storage unavailable: the change simply is not remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [prefs, update]
}
