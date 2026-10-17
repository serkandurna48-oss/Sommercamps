'use client'

import { createContext, useContext } from 'react'

/**
 * Wer sieht diesen Vereins-Admin-Bereich gerade — platform_owner (die
 * gesamte Plattform steuert und sich hier gerade EINEN Verein ansieht) oder
 * der Verein selbst (org_admin)? Reiner Anzeige-Zustand für die "Zur
 * Plattform"-Rückkehr im Band (siehe OrgSwitcher) — KEINE Berechtigungs-
 * grenze. Die eigentliche Prüfung, ob der Aufruf überhaupt erlaubt ist,
 * passiert serverseitig in OrgAdminLayout (und erneut bei jedem
 * Backend-Request, siehe app/auth_deps.py) — dieser Context entscheidet nur
 * über ein sichtbares Link, niemals über Zugriff.
 */
const ViewerContext = createContext<{ isPlatformOwner: boolean } | null>(null)

export function ViewerProvider({ isPlatformOwner, children }: { isPlatformOwner: boolean; children: React.ReactNode }) {
  return <ViewerContext.Provider value={{ isPlatformOwner }}>{children}</ViewerContext.Provider>
}

/** Default `false` (kein Rückweg anzeigen), falls eine Seite außerhalb des
 * Providers rendert — sicherer Fallback, kein Absturz. */
export function useIsPlatformOwner(): boolean {
  return useContext(ViewerContext)?.isPlatformOwner ?? false
}
